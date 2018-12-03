import {Transform} from 'stream';

export class LineTransform extends Transform {
  private _value : string = "";

  constructor() {
    super();
    this.setEncoding('utf8');
  }

  _transform(chunk : Buffer | string | any , encoding : string, callback : (error? : any, data? : any) => void) {
      if (chunk instanceof Buffer) {
        this._value = this._value + chunk.toString('utf8');
      }
      if (typeof chunk === "string") {
        this._value = this._value + chunk;
      }
      let lines = this._value.split(/\r?\n/);
      for (let i=0; i < lines.length - 1; i++) {
        this.push(lines[i]);
      }
      this._value = lines[lines.length - 1];
      callback();
  }
  
  _flush(done : (error? : any, data? : any) => void) {
    this.push(this._value);
    done();
  }
}