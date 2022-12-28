#version 300 es

precision highp float;
precision highp int;

#include "./lygia/generative/cnoise.glsl"

uniform vec2 u_resolution;
uniform float u_screen_dpr;
uniform float u_time;

uniform float u_frequency;
uniform float u_amplitude;
uniform int u_harmonics;
uniform float u_harmonic_spread;
uniform float u_harmonic_gain;
uniform vec2 u_harmonic_travel;
uniform float u_speed;

out uint final_value;

void main() {
  vec2 coord = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  // Square, fixed scale, and centered
  vec2 xy = (coord - u_resolution * 0.5) / (500. * u_screen_dpr);
  // Fixed offset because the (0, 0) center looks too symmetrical
  xy += vec2(17, 20);

  // Construct noise
  float value = 0.5;
  float this_amplitude = u_amplitude;
  float this_frequency = u_frequency;
  for (int i = 0; i < u_harmonics; i++) {
    value += this_amplitude * cnoise(vec3(xy * this_frequency, u_time * u_speed));

    this_frequency *= u_harmonic_spread;
    this_amplitude *= u_harmonic_gain;
    xy += u_harmonic_travel;
  }

  final_value = clamp(uint(floor(clamp(value, 0., 1.) * 65536.)), 0u, 65535u);
}
