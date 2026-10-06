/** Big-endian reader matching java.io.DataInputStream. */
export class Reader {
  private p = 0;
  private readonly v: DataView;
  constructor(bytes: Uint8Array) {
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get pos(): number {
    return this.p;
  }
  get eof(): boolean {
    return this.p >= this.v.byteLength;
  }
  i8(): number {
    return this.v.getInt8(this.p++);
  }
  u16(): number {
    const x = this.v.getUint16(this.p);
    this.p += 2;
    return x;
  }
  i16(): number {
    const x = this.v.getInt16(this.p);
    this.p += 2;
    return x;
  }
  bytes(n: number): Uint8Array {
    const out = new Uint8Array(this.v.buffer, this.v.byteOffset + this.p, n);
    this.p += n;
    return out;
  }
}
