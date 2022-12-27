#version 300 es

precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D u_positions_texture; // 2-channel texture encoding the positions of each point along the line
uniform vec2 u_resolution;
uniform float u_screen_dpr;
uniform float u_line_width;
uniform float u_line_feather_width;
uniform int u_num_line_points;

in int a_normal;
in int a_line_point;

flat out int v_line_index;
out vec2 v_uv;

vec2 getPointPosition(int line_index, int point_index) {
  uvec2 position_raw = texelFetch(u_positions_texture, ivec2(line_index, point_index), 0).xy;
  return vec2(position_raw) / 65535.0; // 0–1 range
}

void main() {
  int line_index = gl_InstanceID;
  int point_index = a_line_point;

  vec2 point_pos = getPointPosition(line_index, point_index);

  vec2 prev_point_pos = getPointPosition(line_index, point_index - 1);
  vec2 next_point_pos = getPointPosition(line_index, point_index + 1);
  float has_prev = step(0.5, float(point_index)); // point_index < 0 before the first point in the line
  float has_next = step(float(point_index), float(u_num_line_points - 1) - 0.5); // point_index > (u_num_line_points - 1) after the last point in the line

  vec2 t1 = point_pos - prev_point_pos;              // vector from previous point to current point
  vec2 n1 = normalize(vec2(t1.y, -t1.x));            // perpendicular normal
  vec2 t2 = next_point_pos - point_pos;              // vector from current point to next point
  vec2 n2 = normalize(vec2(t2.y, -t2.x));            // perpendicular normal
  vec2 n = normalize(n1 * has_prev + n2 * has_next); // normal for this point is in between the normals of the adjacent lines

  // there will be two points for this position; we move them in opposite directions along the computed normal `n` to make a thick line
  float orientation = float(a_normal);
  float adjusted_line_width = u_line_width + (u_line_feather_width / 2.) * 2.; // to account for feathering the edges
  vec2 px = 1. / u_resolution * u_screen_dpr; // normalized pixel size (equivalent across screens)
  vec2 offset = n * orientation * 0.5 * adjusted_line_width * px; // move both points outwards along the normal.

  vec2 pos = point_pos + offset;
  gl_Position = vec4(pos * 2.0 - 1.0, 0, 1); // convert to clip space

  v_line_index = line_index;
  v_uv = vec2(
    // How far horizontally across the line does this point fall?
    (orientation + 1.) / 2., // orientation is -1 on the left point and 1 on the right point
    // How far up the line is this point?
    float(point_index) / float(u_num_line_points - 1)
  );
}
