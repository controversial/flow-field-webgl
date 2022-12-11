#version 300 es

precision highp float;

uniform vec2 u_resolution;
uniform float u_screen_dpr;

out vec4 color;

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution;
  float checkerboard_size = 20.0 * u_screen_dpr;
  int stripes_x = int(gl_FragCoord.x / checkerboard_size) % 2;
  int stripes_y = int(gl_FragCoord.y / checkerboard_size) % 2;
  int checkerboard = (stripes_x + stripes_y) % 2;

  color = vec4(vec3(checkerboard), 1);
}
