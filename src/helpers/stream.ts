import {Transform} from 'stream';

export class LineTransform extends Transform.Transform {
  private _value : string = "";

  
  flush(done : any) {
    this.push(this._value);
    done();
  }
}