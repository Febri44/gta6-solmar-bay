// renderer.js — WebGL1 renderer for Solmar Bay.
//
// Three draw calls per frame for the world:
//   1. static city mesh (roads, buildings, palms, lamps, zebra) — built once
//   2. dynamic vehicle mesh (player + traffic + parked + police) — rebuilt
//      every frame from box parts
//   3. dynamic pedestrian mesh — rebuilt every frame from box parts
// Plus a water plane and a sky gradient painted by CSS behind the canvas.
// Indices are ALWAYS Uint32: the dynamic meshes exceed 65,536 vertices,
// and the old 16-bit wrap is exactly what made NPCs vanish in early builds.

var Renderer = (function () {
  // ---- MeshBuilder ------------------------------------------------------
  function MeshBuilder() {
    this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = [];
  }
  MeshBuilder.prototype.vcount = function () { return this.pos.length / 3; };

  MeshBuilder.prototype.pushVert = function (x, y, z, nx, ny, nz, color, u, v) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    var r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
    this.col.push(r, g, b);
    this.uv.push(u, v);
  };

  MeshBuilder.prototype.quad = function (a, b, c, d, n, color, uvRect) {
    // a,b,c,d are [x,y,z]; winding counter-clockwise seen from n.
    var base = this.vcount();
    var pts = [a, b, c, d];
    var uvs = [[uvRect.u0, uvRect.v1], [uvRect.u1, uvRect.v1],
               [uvRect.u1, uvRect.v0], [uvRect.u0, uvRect.v0]];
    for (var i = 0; i < 4; i++) {
      this.pushVert(pts[i][0], pts[i][1], pts[i][2], n[0], n[1], n[2], color, uvs[i][0], uvs[i][1]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  MeshBuilder.prototype.quad3 = function (ax, ay, az, bx, by, bz, cx, cy, cz, color, uvRect) {
    // Single triangle (palm fronds). Normal from cross product.
    var ux = bx - ax, uy = by - ay, uz = bz - az;
    var vx = cx - ax, vy = cy - ay, vz = cz - az;
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    var base = this.vcount();
    this.pushVert(ax, ay, az, nx / len, ny / len, nz / len, color, uvRect.u0, uvRect.v1);
    this.pushVert(bx, by, bz, nx / len, ny / len, nz / len, color, uvRect.u1, uvRect.v1);
    this.pushVert(cx, cy, cz, nx / len, ny / len, nz / len, color, uvRect.u0, uvRect.v0);
    this.idx.push(base, base + 1, base + 2);
  };

  MeshBuilder.prototype.flatQuad = function (cx, cz, w, d, y, color, uvRect) {
    // Winding is counter-clockwise seen from above (+y): a=(x0,z0),
    // b=(x0,z1), c=(x1,z1), d=(x1,z0). The naive x0z0/x1z0/x1z1 order is
    // clockwise from above and gets back-face culled.
    var hw = w / 2, hd = d / 2;
    this.quad([cx - hw, y, cz - hd], [cx - hw, y, cz + hd], [cx + hw, y, cz + hd],
      [cx + hw, y, cz - hd], [0, 1, 0], color, uvRect);
  };

  // Axis-aligned box centred at (cx,cy,cz). sideUV covers the 4 walls,
  // opts.top overrides the roof colour, opts.topUV the roof tile.
  MeshBuilder.prototype.box = function (cx, cy, cz, w, h, d, color, uvRect, opts) {
    opts = opts || {};
    var hw = w / 2, hh = h / 2, hd = d / 2;
    var y0 = cy - hh, y1 = cy + hh;
    var x0 = cx - hw, x1 = cx + hw, z0 = cz - hd, z1 = cz + hd;
    var topColor = opts.top !== undefined ? opts.top : color;
    var topUV = opts.topUV || uvRect;
    // +z face
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color, uvRect);
    // -z face
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], color, uvRect);
    // +x face
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], color, uvRect);
    // -x face
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], color, uvRect);
    // top (CCW from above: z0 -> z1 on the -x side first)
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], topColor, topUV);
    // bottom (CCW from below)
    this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0], color, uvRect);
  };

  // Box rotated around Y by rotY (radians), centred at (cx,cy,cz).
  MeshBuilder.prototype.boxRot = function (cx, cy, cz, w, h, d, rotY, color, uvRect, opts) {
    opts = opts || {};
    var c = Math.cos(rotY), s = Math.sin(rotY);
    function rot(px, pz) {
      return [cx + px * c - pz * s, cz + px * s + pz * c];
    }
    var hw = w / 2, hh = h / 2, hd = d / 2;
    var y0 = cy - hh, y1 = cy + hh;
    var corners = [
      rot(-hw, -hd), rot(hw, -hd), rot(hw, hd), rot(-hw, hd)
    ];
    function P(i, y) { return [corners[i][0], y, corners[i][1]]; }
    // +z local face (corners 2,3), -z (1,0), +x (1,2), -x (0,3)
    var topColor = opts.top !== undefined ? opts.top : color;
    this.quad(P(3, y0), P(2, y0), P(2, y1), P(3, y1), [s, 0, c], color, uvRect);
    this.quad(P(1, y0), P(0, y0), P(0, y1), P(1, y1), [-s, 0, -c], color, uvRect);
    this.quad(P(2, y0), P(1, y0), P(1, y1), P(2, y1), [c, 0, -s], color, uvRect);
    this.quad(P(0, y0), P(3, y0), P(3, y1), P(0, y1), [-c, 0, s], color, uvRect);
    this.quad(P(0, y1), P(3, y1), P(2, y1), P(1, y1), [0, 1, 0], topColor, uvRect);
    this.quad(P(3, y0), P(0, y0), P(1, y0), P(2, y0), [0, -1, 0], color, uvRect);
  };

  // Vertical cylinder (trunk / lamp post / wheel). lean tilts the top.
  MeshBuilder.prototype.cylinder = function (cx, y0, cz, rBot, rTop, h, seg, color, uvRect, lean) {
    lean = lean || 0;
    var base = this.vcount();
    var topX = cx + lean * h;
    for (var i = 0; i <= seg; i++) {
      var a = i / seg * Math.PI * 2;
      var ca = Math.cos(a), sa = Math.sin(a);
      this.pushVert(cx + ca * rBot, y0, cz + sa * rBot, ca, 0, sa, color, uvRect.u0, uvRect.v1);
      this.pushVert(topX + ca * rTop, y0 + h, cz + sa * rTop, ca, 0, sa, color, uvRect.u1, uvRect.v0);
    }
    for (var j = 0; j < seg; j++) {
      var b0 = base + j * 2;
      this.idx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2);
    }
    // Top cap.
    var cb = this.vcount();
    this.pushVert(topX, y0 + h, cz, 0, 1, 0, color, uvRect.u0, uvRect.v0);
    for (var k = 0; k < seg; k++) {
      var a2 = k / seg * Math.PI * 2, a3 = (k + 1) / seg * Math.PI * 2;
      this.pushVert(topX + Math.cos(a2) * rTop, y0 + h, cz + Math.sin(a2) * rTop, 0, 1, 0, color, uvRect.u1, uvRect.v0);
      this.pushVert(topX + Math.cos(a3) * rTop, y0 + h, cz + Math.sin(a3) * rTop, 0, 1, 0, color, uvRect.u0, uvRect.v1);
      this.idx.push(cb, cb + 1 + k * 2, cb + 2 + k * 2);
    }
  };

  // Wheel: short cylinder lying on its side, axis along local X after rotY.
  MeshBuilder.prototype.wheel = function (cx, cy, cz, r, w, rotY, color) {
    var seg = 10;
    var c = Math.cos(rotY), s = Math.sin(rotY);
    var base = this.vcount();
    var uv = TEX.TILES.white;
    for (var i = 0; i <= seg; i++) {
      var a = i / seg * Math.PI * 2;
      var ca = Math.cos(a), sa = Math.sin(a);
      // Circle lies in the Y/Z plane (axle along X), then rotated by rotY.
      var ly = ca * r, lz = sa * r;
      var wx = cx + (-w / 2) * c - lz * s;
      var wz = cz + (-w / 2) * s + lz * c;
      var wx2 = cx + (w / 2) * c - lz * s;
      var wz2 = cz + (w / 2) * s + lz * c;
      var nx = 0, ny = ca, nz = sa;
      var rnx = nx * c - nz * s, rnz = nx * s + nz * c;
      this.pushVert(wx, cy + ly, wz, rnx, ny, rnz, color, uv.u0, uv.v1);
      this.pushVert(wx2, cy + ly, wz2, rnx, ny, rnz, color, uv.u1, uv.v0);
    }
    for (var j = 0; j < seg; j++) {
      var b0 = base + j * 2;
      this.idx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3);
    }
  };

  // ---- Renderer ---------------------------------------------------------
  function create(canvas) {
    var gl = canvas.getContext('webgl', { alpha: true, antialias: true });
    if (!gl) throw new Error('WebGL not available');
    // WebGL1 needs this extension for 32-bit indices — without the call,
    // drawElements(UNSIGNED_INT) fails with INVALID_ENUM and nothing draws.
    if (!gl.getExtension('OES_element_index_uint')) {
      throw new Error('OES_element_index_uint not available');
    }

    var vsSrc = [
      'attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute vec2 aUv;',
      'uniform mat4 uMVP; uniform mat4 uModel;',
      'varying vec3 vNor; varying vec3 vCol; varying vec2 vUv; varying float vDist;',
      'void main(){',
      '  vec4 wp = uModel * vec4(aPos, 1.0);',
      '  vNor = normalize(mat3(uModel) * aNor);',
      '  vCol = aCol; vUv = aUv;',
      '  vec4 vp = uMVP * wp;',
      '  vDist = -vp.z;',
      '  gl_Position = vp;',
      '}'
    ].join('\n');
    var fsSrc = [
      'precision mediump float;',
      'varying vec3 vNor; varying vec3 vCol; varying vec2 vUv; varying float vDist;',
      'uniform sampler2D uTex; uniform vec3 uSun; uniform vec3 uFog;',
      'void main(){',
      '  vec3 tex = texture2D(uTex, vUv).rgb;',
      '  float diff = max(dot(normalize(vNor), normalize(uSun)), 0.0);',
      '  float amb = 0.45;',
      '  vec3 col = vCol * tex * (amb + 0.75 * diff);',
      '  float f = clamp((vDist - 120.0) / 260.0, 0.0, 0.75);',
      '  gl_FragColor = vec4(mix(col, uFog, f), 1.0);',
      '}'
    ].join('\n');

    function shader(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + gl.getShaderInfoLog(sh));
      }
      return sh;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('program: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    var loc = {
      pos: gl.getAttribLocation(prog, 'aPos'),
      nor: gl.getAttribLocation(prog, 'aNor'),
      col: gl.getAttribLocation(prog, 'aCol'),
      uv: gl.getAttribLocation(prog, 'aUv'),
      mvp: gl.getUniformLocation(prog, 'uMVP'),
      model: gl.getUniformLocation(prog, 'uModel'),
      tex: gl.getUniformLocation(prog, 'uTex'),
      sun: gl.getUniformLocation(prog, 'uSun'),
      fog: gl.getUniformLocation(prog, 'uFog')
    };

    // Atlas texture.
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, TEX.makeAtlas());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(loc.tex, 0);
    // Warm low sun from the west (sunset over the bay is east, so the light
    // comes low from the west-southwest and throws long shadows east).
    gl.uniform3f(loc.sun, -0.55, 0.35, 0.45);
    gl.uniform3f(loc.fog, 0.85, 0.45, 0.35);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    function makeBuffers(mb) {
      var b = {
        pos: gl.createBuffer(), nor: gl.createBuffer(),
        col: gl.createBuffer(), uv: gl.createBuffer(),
        idx: gl.createBuffer(), count: mb.idx.length
      };
      gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.pos), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.nor);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.nor), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.col);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.col), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.uv);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.uv), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mb.idx), gl.STATIC_DRAW);
      return b;
    }

    function updateBuffers(b, mb) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.pos), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.nor);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.nor), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.col);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.col), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.uv);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.uv), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mb.idx), gl.DYNAMIC_DRAW);
      b.count = mb.idx.length;
    }

    function drawBuffers(b, mvp, model) {
      gl.uniformMatrix4fv(loc.mvp, false, mvp);
      gl.uniformMatrix4fv(loc.model, false, model);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
      gl.enableVertexAttribArray(loc.pos);
      gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.nor);
      gl.enableVertexAttribArray(loc.nor);
      gl.vertexAttribPointer(loc.nor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.col);
      gl.enableVertexAttribArray(loc.col);
      gl.vertexAttribPointer(loc.col, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.uv);
      gl.enableVertexAttribArray(loc.uv);
      gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
      gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_INT, 0);
    }

    var IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    // Static city mesh, built once.
    var staticMb = new MeshBuilder();
    CITY.buildStatic(staticMb);
    var staticBuf = makeBuffers(staticMb);

    // Dynamic meshes, rebuilt every frame.
    var vehMb = new MeshBuilder();
    var vehBuf = makeBuffers(vehMb);
    var pedMb = new MeshBuilder();
    var pedBuf = makeBuffers(pedMb);

    // Water plane: covers only the bay (x > 205), not the sand strip.
    var waterMb = new MeshBuilder();
    waterMb.flatQuad(287, 0, 165, 460, 0.15, 0x2e5f8a, TEX.TILES.white);
    var waterBuf = makeBuffers(waterMb);

    function resize(w, h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }

    function render(viewProj, vehMesh, pedMesh) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      drawBuffers(staticBuf, viewProj, IDENTITY);
      updateBuffers(vehBuf, vehMesh);
      drawBuffers(vehBuf, viewProj, IDENTITY);
      updateBuffers(pedBuf, pedMesh);
      drawBuffers(pedBuf, viewProj, IDENTITY);
      drawBuffers(waterBuf, viewProj, IDENTITY);
    }

    return {
      gl: gl, MeshBuilder: MeshBuilder, resize: resize, render: render,
      staticVerts: staticMb.vcount(), staticTris: staticMb.idx.length / 3
    };
  }

  // ---- camera matrices (column-major) -----------------------------------
  function perspective(fovDeg, aspect, near, far) {
    var f = 1 / Math.tan(fovDeg * Math.PI / 360);
    var nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  function lookAt(eye, target, up) {
    var zx = eye.x - target.x, zy = eye.y - target.y, zz = eye.z - target.z;
    var zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
    zx /= zl; zy /= zl; zz /= zl;
    var xx = up.y * zz - up.z * zy, xy = up.z * zx - up.x * zz, xz = up.x * zy - up.y * zx;
    var xl = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye.x + xy * eye.y + xz * eye.z),
      -(yx * eye.x + yy * eye.y + yz * eye.z),
      -(zx * eye.x + zy * eye.y + zz * eye.z), 1
    ]);
  }

  function multiply(a, b) {
    var out = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        out[c * 4 + r] = s;
      }
    }
    return out;
  }

  return { create: create, perspective: perspective, lookAt: lookAt, multiply: multiply };
})();
