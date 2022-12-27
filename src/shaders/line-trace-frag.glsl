#version 300 es

precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D u_positions_texture; // 2-channel texture encoding line positions traced “so far”
uniform usampler2D u_field_texture; // 1-channel texture encoding the flow field
uniform int u_step_number; // which step are we computing?
uniform float u_step_size; // how far to move in the flow field per step?

// these apply to the noise field and to the final output image, but are irrelevant to the positions texture
uniform vec2 u_resolution;
uniform float u_screen_dpr;


out uvec2 color;

void main() {
  uvec2 predecessor_position_raw = texelFetch(u_positions_texture, ivec2(gl_FragCoord.x, u_step_number), 0).xy;

  // Copy predecessor row from input texture to output texture
  if (gl_FragCoord.y < float(u_step_number + 1)) {
    color = predecessor_position_raw;
  // In the new row, trace new position
  } else {
    vec2 predecessor_position = vec2(predecessor_position_raw) / 65535.0;
    float field_value = float(texture(u_field_texture, predecessor_position).r) / 65535.0;
    float angle = 2.0 * 3.1415926535 * field_value;
    float dx = cos(angle) * u_step_size;
    float dy = sin(angle) * u_step_size;

    vec2 px = 1. / u_resolution * u_screen_dpr; // normalized pixel size (equivalent across screens)
    vec2 new_position = predecessor_position + vec2(dx, dy) * px; // make the step

    color = uvec2(new_position * 65536.0);
  }
}
