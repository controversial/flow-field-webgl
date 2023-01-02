#version 300 es

precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D u_positions_texture; // 2-channel texture encoding line positions traced “so far”
uniform usampler2D u_field_texture; // 1-channel texture encoding the flow field
uniform float u_field_amplitude; // magnitude of min/max value encoded in the 0–65535 range
uniform int u_step_number; // which step are we computing?
uniform float u_step_size; // how far to move in the flow field per step?

// these apply to the noise field and to the final output image, but are irrelevant to the positions texture
uniform vec2 u_resolution;
uniform float u_screen_dpr;


out uvec2 out_position;

float sampleField(ivec2 position) {
  float texture_value = float(texelFetch(u_field_texture, position, 0).r);
  // the 0–65535 range encodes values from -u_field_amplitude to +u_field_amplitude
  float normalized_value = texture_value / 65535.0;
  float field_value = normalized_value * (2.0 * u_field_amplitude) - u_field_amplitude;
  return field_value;
}

float sampleFieldBilinear(vec2 position) {
  ivec2 position_floor = ivec2(floor(position));
  vec2 position_fract = fract(position);
  float field_value_00 = sampleField(position_floor);
  float field_value_01 = sampleField(position_floor + ivec2(1, 0));
  float field_value_10 = sampleField(position_floor + ivec2(0, 1));
  float field_value_11 = sampleField(position_floor + ivec2(1, 1));
  float field_value = mix(
    mix(field_value_00, field_value_01, position_fract.x),
    mix(field_value_10, field_value_11, position_fract.x),
    position_fract.y
  );
  return field_value;
}


void main() {
  uvec2 predecessor_position_raw = texelFetch(u_positions_texture, ivec2(gl_FragCoord.x, u_step_number), 0).xy;

  // Copy predecessor row from input texture to output texture
  if (gl_FragCoord.y < float(u_step_number + 1)) {
    out_position = predecessor_position_raw;
  // In the new row, trace new position
  } else {
    vec2 predecessor_position = vec2(predecessor_position_raw) / 65535.0;
    float field_value = sampleFieldBilinear(predecessor_position * u_resolution / u_screen_dpr);
    float angle = 2.0 * 3.1415926535 * (field_value + 0.25); // add 0.25 to rotate by 90deg, so that 0 is up
    float dx = cos(angle) * u_step_size;
    float dy = sin(angle) * u_step_size;

    vec2 px = 1. / u_resolution * u_screen_dpr; // normalized pixel size (equivalent across screens)
    vec2 new_position = predecessor_position + vec2(dx, dy) * px; // make the step

    out_position = uvec2(new_position * 65536.0);
  }
}
