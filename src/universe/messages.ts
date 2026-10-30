// N-body 작업자 → 페이지 메시지 형식.

export type WorkerOut =
  | { type: "ic"; psi: Float32Array }
  | { type: "snap"; i: number; la: number; d: Int16Array; q: Uint8Array }
  | { type: "done" }
  | { type: "gal"; G: number; host: Int32Array; off: Float32Array; GP: Float32Array; nrm: Float32Array };
