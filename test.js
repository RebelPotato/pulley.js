import { make, toStream, embed, map, fold, filter, asRef } from "./dist/pulley.js";

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
const test1 = {
  expect: () => pipe(
    [1, 2, 3],
    embed,
    toStream,
    fold(f(`$0 + $1`), `0`)
  ),
  toBe: 6,
}
const test2 = {
  expect: () => pipe(
    [1, 2, 3],
    asRef,
    toStream,
    map(f(`Math.floor($0 / 2)`)),
    fold(f(`$0 + $1`), `0`)
  ),
  toBe: 2,
}
const test3 = {
  expect: () => pipe(
    [1, 2, 3, 4],
    embed,
    toStream,
    filter(f(`$0 % 2 === 0`)),
    map(f(`$0 * $0`)),
    fold(f(`$0 + $1`), `0`)
  ),
  toBe: 20,
}
const boptions = { indent_size: 2, space_in_empty_paren: true }
const format = (code) => js_beautify(code, boptions);
const tests = [test1, test2, test3];
const results = [];
for (let i = 0; i < tests.length; i++) {
  const test = tests[i];
  const code = test.expect.toString();
  const tested = make(test.expect);
  const generated = tested.body.toString();
  const result = tested.run();
  const expected = test.toBe;
  const passed = result === expected;
  results.push({ code, generated, result, expected, passed });
  const elem = h("section", {}, [
    h("h2", {}, [`Test ${i + 1}`]),
    h("p", { style: { color: passed ? "green" : "red" } }, [passed ? "Passed" : "Failed"]),
    h("h3", {}, ["Code"]),
    h("pre", {}, [format(code)]),
    h("h3", {}, ["Generated"]),
    h("pre", {}, [format(generated)]),
    h("p", {}, [`Expected: ${expected}, got: ${result}`]),
  ]);
  document.body.appendChild(elem);
}