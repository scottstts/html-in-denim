// The print's ink layer (print.ts): an HTML element's snapshot (8-bit sRGB, as the browser hands it
// over) to linear, premultiplied colour in an sRGB texture, then its mip chain (box filtered in linear
// space by the sRGB views). Level 0 also records how the snapshot's alpha is stored: a colour channel
// above its alpha is only possible in straight alpha, and partial coverage at all is needed to tell.

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
// x: 1 if the snapshot's colour is premultiplied by its alpha
@group(0) @binding(2) var<uniform> mode: vec4<u32>;
// [0]: a texel had colour above its alpha, [1]: a texel had partial alpha
@group(0) @binding(3) var<storage, read_write> flags: array<atomic<u32>, 2>;

struct FsIn {
  @builtin(position) pos: vec4<f32>,
};

@vertex
fn vsFull(@builtin(vertex_index) vi: u32) -> FsIn {
  let p = vec2<f32>(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o: FsIn;
  o.pos = vec4<f32>(p * 2.0 - 1.0, 0.0, 1.0);
  return o;
}

fn srgbToLinear(c: vec3<f32>) -> vec3<f32> {
  return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn fsPrep(in: FsIn) -> @location(0) vec4<f32> {
  let c = textureLoad(src, vec2<i32>(in.pos.xy), 0);
  let a = c.a;
  if (max(c.r, max(c.g, c.b)) > a + 1.5 / 255.0) { atomicOr(&flags[0], 1u); }
  if (a > 2.0 / 255.0 && a < 253.0 / 255.0) { atomicOr(&flags[1], 1u); }
  if (a <= 0.0) { return vec4<f32>(0.0); }
  // straight colour in its encoded (sRGB) space, then linear, then premultiplied
  let s = select(c.rgb, c.rgb / a, mode.x == 1u);
  return vec4<f32>(srgbToLinear(clamp(s, vec3<f32>(0.0), vec3<f32>(1.0))) * a, a);
}

@fragment
fn fsDown(in: FsIn) -> @location(0) vec4<f32> {
  // the level below is half the size, rounded down: one bilinear tap at the centre of each 2 x 2 block
  let uv = in.pos.xy / vec2<f32>(max(textureDimensions(src) / 2u, vec2<u32>(1u)));
  return textureSampleLevel(src, smp, uv, 0.0);
}
