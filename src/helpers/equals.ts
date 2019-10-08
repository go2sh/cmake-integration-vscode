/*
 * Copyright 2019 Christoph Seitz
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
 * Object equals helpers
 */

const equalsArray = (a: Array<any>, b: Array<any>) => {
    if (a.length != b.length) {
        return false;
    } else {
        for (const i in a) {
            if (!equals(a[i], b[i]))
                return false;
        }
    }
    return true;
}

const equalsObject = (a: { [key: string]: any }, b: { [key: string]: any }) => {
    let aProps = Object.getOwnPropertyNames(a);
    let bProps = Object.getOwnPropertyNames(a);

    if (aProps.length != bProps.length) {
        return false;
    }

    for (const prop of aProps) {
        if (!equals(a[prop], b[prop]))
            return false;
    }

    return true;
}

const equals = (a: any, b: any): boolean => {


    if (typeof a !== typeof b) {
        return false;
    }

    if (typeof a === "object") {
        if (a instanceof Array) {
            if (b instanceof Array) {
                return equalsArray(a, b);
            } else {
                return false;
            }
        } else {
            return equalsObject(a, b);
        }
    } else {
        return a === b;
    }
}

export { equals, equalsArray, equalsObject };
