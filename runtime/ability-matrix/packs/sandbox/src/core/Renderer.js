import {
  WebGLRenderer,
  PCFShadowMap,
  ACESFilmicToneMapping,
  SRGBColorSpace
} from 'three';
import { settings } from '../config/settings.js';

/**
 * Thin wrapper around WebGLRenderer that owns canvas sizing, pixel-ratio
 * budgeting and the render-quality knobs the rest of the app never touches.
 */
export class Renderer {
  constructor(canvas) {
    this.gl = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false
    });

    this.gl.setPixelRatio(this.targetPixelRatio());
    const first = this.viewportSize();
    this._w = 0;
    this._h = 0;
    this.gl.setSize(first.w, first.h, false);
    this._w = first.w;
    this._h = first.h;

    this.gl.shadowMap.enabled = true;
    // r185 deprecates PCFSoftShadowMap and draws PCF instead. Ask for that
    // filter directly so the name stays in scope and the console stays quiet.
    this.gl.shadowMap.type = PCFShadowMap;
    // The frame renders the scene several times (depth prepass, distortion,
    // contact shadows, main pass). Automatic updates would rebuild the cascade
    // shadow maps for every one of them, so the app flags a single update per
    // frame instead.
    this.gl.shadowMap.autoUpdate = false;

    // Tone mapping is executed by the post pipeline's OutputPass, which reads
    // these two properties from the renderer.
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = settings.post.exposure;
    this.gl.outputColorSpace = SRGBColorSpace;

    this.gl.info.autoReset = false;

    this._onResize = null;
  }

  /** Cap the pixel ratio. The pipeline itself does not change with the screen. */
  targetPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    return Math.min(dpr, 1.75);
  }

  /**
   * Size from the canvas box, not the window.
   *
   * A phone URL bar, a rotated tablet, an iframe and an ultrawide panel all
   * disagree with `innerWidth`. Drawing the window when the canvas is a
   * different box is what makes the view blur, letterbox or stall. Zero-size
   * frames (the iframe not laid out yet) are refused and retried.
   */
  viewportSize() {
    const canvas = this.gl.domElement;
    const rect = canvas.getBoundingClientRect();
    let w = Math.round(rect.width);
    let h = Math.round(rect.height);
    if (w < 2 || h < 2) {
      const vv = window.visualViewport;
      w = Math.round(vv?.width || canvas.clientWidth || window.innerWidth || 2);
      h = Math.round(vv?.height || canvas.clientHeight || window.innerHeight || 2);
    }
    return { w: Math.max(2, w), h: Math.max(2, h) };
  }

  applySize() {
    const { w, h } = this.viewportSize();
    if (this._w === w && this._h === h && this.gl.getPixelRatio() === this.targetPixelRatio()) return;
    this._w = w;
    this._h = h;
    this.gl.setPixelRatio(this.targetPixelRatio());
    this.gl.setSize(w, h, false);
    this._onResize?.(w, h, this.gl.getPixelRatio());
  }

  get domElement() {
    return this.gl.domElement;
  }

  get size() {
    return this.gl.getSize({ width: 0, height: 0 });
  }

  onResize(callback) {
    this._onResize = callback;
    this.applySize();
    window.addEventListener('resize', this.handleResize, { passive: true });
    window.addEventListener('orientationchange', this.handleResize, { passive: true });
    window.visualViewport?.addEventListener('resize', this.handleResize, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      this._observer = new ResizeObserver(() => this.applySize());
      this._observer.observe(this.gl.domElement);
    }
    const canvas = this.gl.domElement;
    canvas.addEventListener('webglcontextlost', this._onLost, false);
    canvas.addEventListener('webglcontextrestored', this._onRestored, false);
  }

  handleResize = () => {
    this.applySize();
  };

  _onLost = (event) => {
    event.preventDefault();
  };

  _onRestored = () => {
    this._w = 0;
    this.applySize();
  };

  /** Called once per frame before rendering so the editor can drive exposure. */
  syncSettings() {
    this.gl.toneMappingExposure = settings.post.exposure;
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    window.visualViewport?.removeEventListener('resize', this.handleResize);
    this._observer?.disconnect();
    const canvas = this.gl.domElement;
    canvas.removeEventListener('webglcontextlost', this._onLost);
    canvas.removeEventListener('webglcontextrestored', this._onRestored);
    this.gl.dispose();
  }
}
