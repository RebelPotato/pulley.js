import {
  make,
  toStream,
  embed,
  map,
  fold,
  filter,
  asRef,
  flatmap,
  take,
  unfold,
  forEach,
} from "./dist/pulley.js";

function h(tag, props, children = []) {
  const elem = document.createElement(tag);
  for (const key in props) {
    if (key === "style") {
      Object.assign(elem.style, props[key]);
    } else if (key === "dataset") {
      Object.assign(elem.dataset, props[key]);
    } else if (key.startsWith("on")) {
      elem.addEventListener(key.slice(2).toLowerCase(), props[key]);
    } else {
      elem.setAttribute(key, props[key]);
    }
  }
  for (const child of children) {
    if (typeof child === "string") {
      elem.appendChild(document.createTextNode(child));
    } else if (child) {
      elem.appendChild(child);
    } else {
      elem.appendChild(document.createElement("br"));
    }
  }
  return elem;
}

function f(str) {
  // transform all "$0" to 0, "$1" to 1, etc.
  const parts = str.split(/(\$\d+)/);
  const len = parts.length;
  const isVars = parts.map((part) => part.startsWith("$"));
  return (...args) => {
    const acc = [];
    for (let i = 0; i < len; i++) {
      if (isVars[i]) acc.push(args[parseInt(parts[i].slice(1))]);
      else acc.push(parts[i]);
    }
    return acc.join("");
  };
}
const pipe = (x, ...fns) => fns.reduce((v, f) => f(v), x);

// testing
const iota = (n) => unfold((x) => `[${x}, ${x} + 1]`, n);
const tests = [
  {
    expect: () => pipe([1, 2, 3], embed, toStream, fold(f(`$0 + $1`), `0`)),
    toBe: 6,
  },
  {
    expect: () =>
      pipe(
        [1, 2, 3],
        asRef,
        toStream,
        map(f(`Math.floor($0 / 2)`)),
        fold(f(`$0 + $1`), `0`)
      ),
    toBe: 2,
  },
  {
    expect: () =>
      pipe(
        [1, 2, 3, 4],
        embed,
        toStream,
        filter(f(`$0 % 2 === 0`)),
        map(f(`$0 * $0`)),
        fold(f(`$0 + $1`), `0`)
      ),
    toBe: 20,
  },
  {
    expect: () =>
      pipe(
        [0, 1, 2, 3, 4, 5, 6, 7],
        embed,
        toStream,
        filter(f(`$0 % 2 === 0`)),
        take(2),
        map(f(`$0 * $0`)),
        fold(f(`$0 + $1`), `0`)
      ),
    toBe: 4,
  },
  {
    expect: () =>
      pipe(
        [0, 1, 2, 3, 4, 5],
        embed,
        toStream,
        filter(f(`$0 % 2 === 0`)),
        flatmap((x) => toStream(`[${x}, ${x} + 1, ${x} + 2]`)),
        fold(f(`($0.push($1), $0)`), `[]`)
      ),
    toBe: [0, 1, 2, 2, 3, 4, 4, 5, 6],
  },
  {
    expect: () =>
      pipe(
        iota(1),
        flatmap(iota),
        filter(f(`$0 % 2 === 0`)),
        take(10),
        fold(f(`($0.push($1), $0)`), `[]`)
      ),
    toBe: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  },
  {
    expect: () =>
      pipe(
        iota(1),
        flatmap((x) => take(3)(iota(`${x} + 1`))),
        filter(f(`$0 % 2 === 0`)),
        take(10),
        fold(f(`($0.push($1), $0)`), `[]`)
      ),
    toBe: [2, 4, 4, 4, 6, 6, 6, 8, 8, 8],
  },
  {
    expect: () =>
      pipe(
        iota(1),
        flatmap((x) =>
          pipe(
            iota(`${x} * 1`),
            flatmap((x) => iota(`${x} * 2`)),
            take(3)
          )
        ),
        take(10),
        fold(f(`($0.push($1), $0)`), `[]`)
      ),
    toBe: [2, 3, 4, 4, 5, 6, 6, 7, 8, 8],
  },
  {
    expect: () =>
      pipe(
        iota(1),
        flatmap((x) =>
          pipe(
            iota(`${x} + 10`),
            flatmap((x) => toStream(`[${x} + 100, ${x} + 200]`)),
            filter(f(`$0 % 3 === 0`)),
            take(3)
          )
        ),
        filter(f(`$0 % 2 === 0`)),
        take(10),
        fold(f(`($0.push($1), $0)`), `[]`)
      ),
    toBe: [114, 114, 216, 114, 216, 114, 216, 216, 216, 120],
  },
];

const format = (code) =>
  js_beautify(code, { indent_size: 2, space_in_empty_paren: true });
function match(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!match(a[i], b[i])) return false;
    }
    return true;
  }
  return a === b;
}
const results = [];
for (let i = 0; i < tests.length; i++) {
  const test = tests[i];
  const code = test.expect.toString();
  const tested = make(test.expect.length, test.expect);
  const generated = tested.body.toString();
  const expected = test.toBe;
  let result, passed;
  try {
    result = tested.run();
    passed = match(result, expected);
  } catch (e) {
    console.error(e);
    passed = false;
  }
  results.push({ code, generated, result, expected, passed });
  const elem = h("section", {}, [
    h("h2", { style: { color: passed ? "green" : "red" } }, [
      `Test ${i + 1} : `,
      passed ? "Passed" : "Failed",
    ]),
    h("h3", {}, ["Code"]),
    h("pre", {}, [format(code)]),
    h("h3", {}, ["Generated"]),
    h("pre", {}, [format(generated)]),
    h("p", {}, [
      passed ? undefined : `expected: ${expected}, `,
      `got: ${result}`,
    ]),
  ]);
  document.body.appendChild(elem);
}
