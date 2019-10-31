/*
 * Copyright 2018 Christoph Seitz
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * Stream transformation for line boundary detection
 */
import { Transform } from "stream";

export class LineTransform extends Transform {
  private _value: string = "";

  constructor() {
    super();
    this.setEncoding("utf8");
  }

  _transform(
    chunk: Buffer | string | any,
    encoding: string,
    callback: (error?: any, data?: any) => void
  ) {
    if (chunk instanceof Buffer) {
      this._value = this._value + chunk.toString(encoding);
    }
    if (typeof chunk === "string") {
      this._value = this._value + chunk;
    }
    let lines = this._value.split(/\r?\n/);
    for (let i = 0; i < lines.length - 1; i++) {
      this.push(lines[i]);
    }
    this._value = lines[lines.length - 1];
    callback();
  }

  _flush(done: (error?: any, data?: any) => void) {
    this.push(this._value);
    done();
  }
}
