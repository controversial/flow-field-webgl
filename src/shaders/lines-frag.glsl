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


// TODO: replace with non-random coloring
float PHI = 1.61803398874989484820459;  // Φ = Golden Ratio
float gold_noise(in vec2 xy, in float seed){
  return fract(tan(distance(xy*PHI, xy)*seed)*xy.x);
}

void main() {
  // Antialias the left and right edges of the line
  float tx = v_uv.x;
  float edge_distance = 0.5 - abs(tx - 0.5);
  float adjusted_line_width = u_line_width + (u_line_feather_width / 2.) * 2.;
  float edge_distance_px = edge_distance * adjusted_line_width;
  float feather = smoothstep(0., u_line_feather_width, edge_distance_px);

  color = vec4(
    gold_noise(vec2(37., 1.), float(v_line_index)),
    gold_noise(vec2(37., 2.), float(v_line_index)),
    gold_noise(vec2(37., 3.), float(v_line_index)),
    feather
  );
  color.rgb *= color.a;

  // color = vec4(1., 1., 1., base_alpha * gradient * feather);
}
