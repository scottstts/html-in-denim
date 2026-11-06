import { shaderModule, UNIFORM } from '../gpu/util';
import prepWgsl from './wgsl/print_prep.wgsl?raw';

/**
 * A printed design on the cloth: an HTML element's rendering (HTML-in-Canvas: the element's snapshot,
 * an ElementImage, drawn straight into a texture), kept as linear premultiplied ink coverage with mips. The surface shader lays it on the face of its
 * layer as screen-print ink on the yarn crowns (surface.wgsl printInk).
 */

/** The snapshot handle of HTML-in-Canvas (WICG html-in-canvas), transferable to a worker. */
export interface ElementImage {
  close(): void;
}

/** What the page hands the engine: the element's snapshot and its size (texels). */
export interface PrintSource {
  kind: 'element';
  image: ElementImage;
  width: number;
  height: number;
}

/** Where the print sits in a layer's rest chart: its centre (m) and height (m); width from the image's aspect. */
export interface PrintPlacement {
  layer: number;
  center: [number, number];
  height: number;
}

/** Bytes of PrintU (surface.wgsl): rect (u0, v top, 1/width, 1/height) in rest metres, (layer, on, w, h). */
export const PRINT_U_BYTES = 32;

type QueueWithElementImage = GPUQueue & {
  drawElementImageToTexture?: (source: { source: ElementImage }, destination: { texture: GPUTexture; size: GPUExtent3DDict }) => void;
  copyElementImageToTexture?: (...args: unknown[]) => void;
};

/** Draw an element snapshot into `texture` with whichever form of the API this browser has. */
function drawElementImage(queue: GPUQueue, image: ElementImage, texture: GPUTexture, width: number, height: number): void {
  const q = queue as QueueWithElementImage;
  if (q.drawElementImageToTexture) {
    q.drawElementImageToTexture({ source: image }, { texture, size: { width, height } });
    return;
  }
  if (!q.copyElementImageToTexture) throw new Error('This browser cannot draw element images into WebGPU textures.');
  // earlier Chrome builds of the proposal (the WICG demos keep the same fallbacks)
  try {
    q.copyElementImageToTexture({ source: image }, { destination: { texture }, width, height });
  } catch {
    q.copyElementImageToTexture(image, width, height, { texture });
  }
}

export class PrintLayer {
  readonly uniform: GPUBuffer;
  readonly sampler: GPUSampler;
  /** The ink texture (all mips); a transparent texel until the first print arrives. */
  view: GPUTextureView;
  /** Called when `view` is replaced (the bind groups that hold it are rebuilt). */
  onViewChange: () => void = () => {};

  private readonly device: GPUDevice;
  private readonly placement: PrintPlacement;
  private tex: GPUTexture;
  private raw: GPUTexture | null = null;
  private readonly layout: GPUBindGroupLayout;
  private readonly prepPipe: GPURenderPipeline;
  private readonly downPipe: GPURenderPipeline;
  private readonly linear: GPUSampler;
  private readonly modeU: GPUBuffer;
  private readonly flags: GPUBuffer;
  private readonly flagsRead: GPUBuffer;
  /** How element snapshots store alpha: unknown until one with partial coverage has been examined. */
  private elementAlpha: 'unknown' | 'straight' | 'premultiplied' = 'unknown';
  private probing = false;

  constructor(device: GPUDevice, placement: PrintPlacement) {
    this.device = device;
    this.placement = placement;
    this.uniform = device.createBuffer({ label: 'printU', size: PRINT_U_BYTES, usage: UNIFORM });
    this.sampler = device.createSampler({ label: 'print', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 16 });
    this.linear = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.tex = device.createTexture({ label: 'print.empty', size: [1, 1], format: 'rgba8unorm-srgb', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: this.tex }, new Uint8Array(4), { bytesPerRow: 4 }, [1, 1]);
    this.view = this.tex.createView();
    this.modeU = device.createBuffer({ label: 'print.mode', size: 16, usage: UNIFORM });
    this.flags = device.createBuffer({ label: 'print.flags', size: 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    this.flagsRead = device.createBuffer({ label: 'print.flagsRead', size: 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const F = GPUShaderStage.FRAGMENT;
    this.layout = device.createBindGroupLayout({
      label: 'printPrep',
      entries: [
        { binding: 0, visibility: F, texture: { sampleType: 'float' } },
        { binding: 1, visibility: F, sampler: { type: 'filtering' } },
        { binding: 2, visibility: F, buffer: { type: 'uniform' } },
        { binding: 3, visibility: F, buffer: { type: 'storage' } },
      ],
    });
    const module = shaderModule(device, 'printPrep', prepWgsl);
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    const pipe = (entryPoint: string) =>
      device.createRenderPipeline({ label: `print.${entryPoint}`, layout, vertex: { module, entryPoint: 'vsFull' }, fragment: { module, entryPoint, targets: [{ format: 'rgba8unorm-srgb' }] }, primitive: { topology: 'triangle-list' } });
    this.prepPipe = pipe('fsPrep');
    this.downPipe = pipe('fsDown');
    this.writeUniform(1, 1, false);
  }

  /** Take a new rendering of the design: upload it, convert it to ink coverage and filter its mips. */
  set(src: PrintSource): void {
    const { width, height } = src;
    if (width < 1 || height < 1) {
      src.image.close();
      return;
    }
    const device = this.device;
    if (!this.raw || this.raw.width !== width || this.raw.height !== height) {
      this.raw?.destroy();
      this.raw = device.createTexture({ label: 'print.raw', size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
      const old = this.tex;
      const mipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1;
      this.tex = device.createTexture({ label: 'print', size: [width, height], format: 'rgba8unorm-srgb', mipLevelCount, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
      this.view = this.tex.createView();
      this.writeUniform(width, height, true);
      this.onViewChange();
      // the old texture may still be read by frames in flight
      void device.queue.onSubmittedWorkDone().then(() => old.destroy());
    }
    try {
      drawElementImage(device.queue, src.image, this.raw, width, height);
    } finally {
      src.image.close();
    }
    // the proposal leaves the snapshot's alpha convention open: examined until it is known
    this.convert(this.elementAlpha === 'premultiplied', this.elementAlpha === 'unknown' && !this.probing);
  }

  private convert(premultiplied: boolean, probe: boolean): void {
    const device = this.device;
    const raw = this.raw!;
    device.queue.writeBuffer(this.modeU, 0, new Uint32Array([premultiplied ? 1 : 0, 0, 0, 0]));
    const enc = device.createCommandEncoder({ label: 'print.prep' });
    if (probe) enc.clearBuffer(this.flags);
    const pass = (level: number, pipe: GPURenderPipeline, src: GPUTextureView) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: this.tex.createView({ baseMipLevel: level, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      p.setPipeline(pipe);
      p.setBindGroup(0, device.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: src }, { binding: 1, resource: this.linear }, { binding: 2, resource: { buffer: this.modeU } }, { binding: 3, resource: { buffer: this.flags } }] }));
      p.draw(3);
      p.end();
    };
    pass(0, this.prepPipe, raw.createView());
    for (let k = 1; k < this.tex.mipLevelCount; k++) pass(k, this.downPipe, this.tex.createView({ baseMipLevel: k - 1, mipLevelCount: 1 }));
    if (probe) enc.copyBufferToBuffer(this.flags, 0, this.flagsRead, 0, 8);
    device.queue.submit([enc.finish()]);
    if (!probe) return;
    this.probing = true;
    void this.flagsRead.mapAsync(GPUMapMode.READ).then(() => {
      const [over, partial] = new Uint32Array(this.flagsRead.getMappedRange().slice(0));
      this.flagsRead.unmap();
      this.probing = false;
      if (over) this.elementAlpha = 'straight';
      else if (partial) {
        this.elementAlpha = 'premultiplied';
        // redo the snapshot that told us (the raw upload is still there, unless a newer one replaced it)
        this.convert(true, false);
      }
    });
  }

  private writeUniform(width: number, height: number, on: boolean): void {
    const P = this.placement;
    const h = P.height;
    const w = (h * width) / height;
    const buf = new ArrayBuffer(PRINT_U_BYTES);
    new Float32Array(buf, 0, 4).set([P.center[0] - w / 2, P.center[1] + h / 2, 1 / w, 1 / h]);
    new Uint32Array(buf, 16, 4).set([P.layer, on ? 1 : 0, width, height]);
    this.device.queue.writeBuffer(this.uniform, 0, buf);
  }
}
