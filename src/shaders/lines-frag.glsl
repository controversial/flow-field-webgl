#version 300 es

precision highp float;
precision highp int;
precision highp usampler2D;


uniform usampler2D u_positions_texture; // 2-channel texture encoding the positions of each point along the line
uniform vec2 u_resolution;
uniform float u_line_width;
uniform float u_line_feather_width;
uniform float u_line_alpha;
uniform int u_num_line_points;
uniform float u_step_size;

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

  // Draw a circular cap at the top end of the line
  float line_length_px = u_step_size * (float(u_num_line_points) - 1.);
  float distance_from_end = 1.0 - v_uv.y;
  float distance_from_end_px = distance_from_end * line_length_px;
  vec2 pos_px = vec2(v_uv.x * adjusted_line_width, distance_from_end_px * 0.9);
  vec2 circle_cap_center = vec2(adjusted_line_width / 2.);
  float radius = adjusted_line_width / 2.;
  float in_circle = 1. - smoothstep(radius - u_line_feather_width, radius, distance(pos_px, circle_cap_center));
  float in_cap = 1. - step(radius, pos_px.y);
  float circle_mask = max(in_circle, 1. - in_cap);


  float base_alpha = u_line_alpha;
  float gradient = v_uv.y;

  color = vec4(1., 1., 1., base_alpha * gradient * min(feather, circle_mask));
  color.rgb *= color.a;
}
