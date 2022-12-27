#version 300 es

precision highp float;
precision highp int;

#include "./lygia/generative/cnoise.glsl"

uniform vec2 u_resolution;
uniform float u_screen_dpr;
uniform float u_time;

out uint final_value;

void main() {
  vec2 coord = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  // Square, fixed scale, and centered
  vec2 xy = (coord - u_resolution * 0.5) / (500. * u_screen_dpr);
  // Fixed offset because the (0, 0) center looks too symmetrical
  xy += vec2(17, 20);

  // Parameters for noise
  const float frequency = 1.0; // scale
  const float amplitude = 0.5;
  const int harmonics = 4; // number of layers to stack
  const float harmonic_spread = 1.5; // difference in frequency between harmonics
  const float harmonic_gain = 0.7; // difference in amplitude between harmonics
  const float speed = 0.05; // how fast the noise moves

  // Construct noise
  float value = 0.5;
  float this_amplitude = amplitude;
  float this_frequency = frequency;
  for (int i = 0; i < harmonics; i++) {
    value += this_amplitude * cnoise(vec3(xy * this_frequency, u_time * speed));

    this_frequency *= harmonic_spread;
    this_amplitude *= harmonic_gain;
  }

  final_value = clamp(uint(floor(clamp(value, 0., 1.) * 65536.)), 0u, 65535u);
}
