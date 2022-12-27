#version 300 es

precision highp float;
precision highp int;
precision highp usampler2D;


uniform usampler2D u_positions_texture; // 2-channel texture encoding the positions of each point along the line
uniform vec2 u_resolution;
uniform float u_line_width;
uniform float u_line_feather_width;
uniform float u_line_alpha;

in vec2 v_uv;
in vec2 v_origin_pos;
flat in int v_line_index;

out vec4 color;


void main() {
  // Antialias the left and right edges of the line
  float tx = v_uv.x;
  float edge_distance = 0.5 - abs(tx - 0.5);
  float adjusted_line_width = u_line_width + (u_line_feather_width / 2.) * 2.;
  float edge_distance_px = edge_distance * adjusted_line_width;
  float feather = smoothstep(0., u_line_feather_width, edge_distance_px);

  float base_alpha = u_line_alpha;
  float gradient = v_uv.y;

  color = vec4(1., 1., 1., base_alpha * gradient * feather);
  color.rgb *= color.a;
}
