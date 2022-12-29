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
  vec2 center = vec2(17, 20);

  // Construct noise
  float value = 0.;
  float total_amplitude = 0.;
  float this_amplitude = u_amplitude;
  float this_frequency = u_frequency;
  for (int i = 0; i < u_harmonics; i++) {
    value += this_amplitude * clamp(cnoise(vec3(xy * this_frequency + center, u_time * u_speed)), -1., 1.);
    total_amplitude += this_amplitude;

    this_frequency *= u_harmonic_spread;
    this_amplitude *= u_harmonic_gain;
    center += u_harmonic_travel;
  }
  // Now, noise may range from -total_amplitude to total_amplitude
  // we need to map this range to 0 to 65535
  float scaled_value = (value + total_amplitude) / (total_amplitude * 2.);
  // one more clamp for good measure
  final_value = clamp(uint(floor(scaled_value * 65536.)), 0u, 65535u);
}
