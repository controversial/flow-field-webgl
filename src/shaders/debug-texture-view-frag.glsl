#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_texture;
uniform vec2 u_resolution;

out vec4 color;


void main() {
  vec2 coord = gl_FragCoord.xy / u_resolution;
  color = texture(u_texture, coord);
}
