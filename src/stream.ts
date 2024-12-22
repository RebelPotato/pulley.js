enum Card {
  AtMostOne = 0,
  Many = 1,
}
type Unit = undefined

declare const __nominal__type: unique symbol;
type Code<A> = string & { readonly [__nominal__type]: A; }

interface Init<S> {
  init: <W>(k: (s: S) => Code<W>) => Code<W>,
}
interface For<A, S> extends Init<S> {
  bound: (arr: S) => Code<number>,
  index: (arr: S, i: Code<number>, k: (a: A) => Code<Unit>) => Code<Unit>,
  to_unfold: () => Unfold<A, [Code<number>, S]>,
  fold_raw: (consumer: (a: A) => Code<Unit>) => Code<Unit>,
  map_raw: <B>(tr: (a: A, k: (s: B) => Code<Unit>) => Code<Unit>) => For<B, S>,
}
interface Unfold<A, S> extends Init<S> {
  term: (arr: S) => Code<boolean>,
  card: Card,
  step: (arr: S, k: (a: A) => Code<Unit>) => Code<Unit>,
  to_unfold: () => Unfold<A, S>,
  fold_raw: (consumer: (a: A) => Code<Unit>) => Code<Unit>,
  map_raw: <B>(tr: (a: A, k: (s: B) => Code<Unit>) => Code<Unit>) => Unfold<B, S>,
}
type Producer<A, S> = For<A, S> | Unfold<A, S>
interface Linear<A> {
  prod: Producer<A, any>,
  match: <R>(opts: {
    "Linear": <S>(producer: Producer<A, S>) => R
  }) => R,
}
interface Nested<A> {
  outer: Producer<any, any>,
  step: (a: any) => StStream<A>,
  match: <R>(opts: {
    "Nested": <B, S>(outer: Producer<B, S>, step: (state: B) => StStream<A>) => R
  }) => R,
}
type StStream<A> = Linear<A> | Nested<A>

type Stream<A> = StStream<Code<A>>

// Counter for variable names
let Count: { var: number, refs: any[] } = {
  var: 0,
  refs: [],
};

function mkVar(name: string): Code<any> {
  const count = Count.var;
  Count.var += 1;
  return `${name}_${count}` as Code<any>;
}

// Stream constructors
function Linear<A, S>(prod: Producer<A, S>): Linear<A> {
  const obj: Linear<A> = {
    prod,
    match: (opts) => opts.Linear(prod),
  };
  return Object.freeze(obj);
}

function Nested<A, B, S>(outer: Producer<B, S>, step: (a: B) => StStream<A>): Nested<A> {
  const obj: Nested<A> = {
    outer,
    step,
    match: (opts) => opts.Nested(outer, step),
  };
  return Object.freeze(obj);
}

// Code generation helpers
function var_init0<S, W>(k: (s: [Code<number>, S]) => Code<W>): (s0: S) => Code<W> {
  return (s0) => {
    const i = mkVar("i");
    return `let ${i} = 0; ${k([i, s0])}` as Code<W>;
  };
}

function var_initU<S, W>(k: (s: Code<S | undefined>) => Code<W>, initial: Code<S | undefined>): Code<W> {
  const s = mkVar("s");
  return `let ${s} = ${initial}; ${k(s)}` as Code<W>;
}

function var_inc<A>(i: Code<number>, rest: Code<A>) {
  return `${i} += 1; ${rest}` as Code<A>;
}

function for_loop(i: Code<number>, term: Code<number>, body: Code<Unit>) {
  return `for (let ${i} = 0; ${i} <= ${term}; ${i}++) { ${body} }` as Code<Unit>;
}

function if_loop(cond: Code<boolean>, body: Code<Unit>) {
  return `if(${cond}) { ${body} }` as Code<Unit>;
}

function while_loop(cond: Code<boolean>, body: Code<Unit>) {
  return `while(${cond}) { ${body} }` as Code<Unit>;
}

function const_init<A, W>(arr: Code<A[]>, k: (s: Code<A[]>) => Code<W>) {
  const varr = mkVar("arr");
  return `const ${varr} = ${arr}; ${k(varr)}` as Code<W>;
}

// Producers
function For<A, S>(
  init: For<A, S>["init"],
  bound: For<A, S>["bound"],
  index: For<A, S>["index"]
): For<A, S> {
  const obj: For<A, S> = {
    init,
    bound,
    index,
    to_unfold: () => {
      const uinit = <W>(k: (s: [Code<number>, S]) => Code<W>) => init(var_init0(k));
      const term = ([i, s0]: [Code<number>, S]) => `${i} <= ${bound(s0)}` as Code<boolean>;
      const step = ([i, s0]: [Code<number>, S], k: (a: A) => Code<Unit>) =>
        index(s0, i, (a) => var_inc(i, k(a)));
      return Unfold(uinit, term, Card.Many, step);
    },
    fold_raw: (consumer) => {
      const i = mkVar("i");
      return init((sp) => for_loop(i, bound(sp), index(sp, i, consumer)));
    },
    map_raw: (tr) =>
      For(init, bound, (s, i, k) => index(s, i, (e) => tr(e, k))),
  };
  return Object.freeze(obj);
}

function Unfold<A, S>(
  init: Unfold<A, S>["init"],
  term: Unfold<A, S>["term"],
  card: Unfold<A, S>["card"],
  step: Unfold<A, S>["step"]
): Unfold<A, S> {
  const obj: Unfold<A, S> = {
    init,
    term,
    card,
    step,
    to_unfold: () => obj,
    fold_raw: (consumer) => {
      if (card === Card.AtMostOne)
        return init((sp) => if_loop(term(sp), step(sp, consumer)));
      return init((sp) => while_loop(term(sp), step(sp, consumer)));
    },
    map_raw: (tr) =>
      Unfold(init, term, card, (s, k) => step(s, (e) => tr(e, k))),
  };
  return Object.freeze(obj);
}

// Helper functions
function to_unfold<A, S0>(prod: Producer<A, S0>) {
  return prod.to_unfold();
}

function toStream<A>(arr: Code<A[]>): Stream<A[]> {
  const init = <W>(k: (s: Code<A[]>) => Code<W>): Code<W> => const_init(arr, k);
  const bound = (arr: Code<A[]>) => `(${arr}).length - 1` as Code<number>;
  const index = (arr: Code<A[]>, i: Code<number>, k: (a: Code<A[]>) => Code<Unit>) => {
    const vel = mkVar("el");
    return `const ${vel} = ${arr}[${i}]; ${k(vel)}` as Code<Unit>;
  };
  return Linear(For(init, bound, index));
}

function unfold<A, Z>(
  prod: (x: Code<Z | undefined>) => Code<[A, Z] | undefined>,
  initial: Code<Z | undefined>
): Stream<A> {
  const init = <W>(k: (s: Code<[A, Z] | undefined>) => Code<W>): Code<W> =>
    var_initU(k, prod(initial));
  const term = (s: Code<[A, Z] | undefined>) => `${s} !== undefined` as Code<boolean>;
  const step = (
    s: Code<[A, Z] | undefined>,
    body: (el: Code<A>) => Code<Unit>
  ) => {
    const el = mkVar("el");
    const s1 = mkVar("s1");
    return `if (${s} === undefined) return; const [${el}, ${s1}] = ${s}; s = ${prod(s1)}; ${body(el)}` as Code<Unit>;
  };
  return Linear(Unfold(init, term, Card.Many, step));
}

// Consumers
function fold_raw<A>(consumer: (a: A) => Code<Unit>, stream: StStream<A>): Code<Unit> {
  return stream.match({
    Linear: (prod) => prod.fold_raw(consumer),
    Nested: (outer, step) =>
      fold_raw((e) => fold_raw(consumer, step(e)), Linear(outer)),
  });
}

function fold<A, Z>(
  f: (s: Code<Z>, a: Code<A>) => Code<Z>,
  z: Code<Z>
): (stream: Stream<A>) => Code<Z> {
  return (stream) => {
    const s = mkVar("s");
    return `let ${s} = ${z}; ${fold_raw(
      (a) => `${s} = ${f(s, a)};` as Code<Unit>,
      stream
    )}; return ${s};` as Code<Z>;
  };
}

// Transformers
function map_raw<A, B>(
  tr: (a: A, k: (s: B) => Code<Unit>) => Code<Unit>,
  stream: StStream<A>
): StStream<B> {
  return stream.match({
    Linear: (prod) => Linear(prod.map_raw(tr)) as StStream<B>,
    Nested: (outer, step) => Nested(outer, (a) => map_raw(tr, step(a))),
  });
}

function map<A, B>(f: (x: Code<A>) => Code<B>): (s: Stream<A>) => Stream<B> {
  return (stream) => {
    const t = mkVar("t");
    return map_raw(
      (a, k) => `const ${t} = ${f(a)}; ${k(t)}` as Code<Unit>,
      stream
    );
  };
}

function flatmap_raw<A, B>(
  tr: (a: A) => StStream<B>,
  stream: StStream<A>
): StStream<B> {
  return stream.match({
    Linear: (prod) => Nested(prod, tr),
    Nested: (outer, step) => Nested(outer, (a) => flatmap_raw(tr, step(a))),
  });
}
const flatmap = flatmap_raw;

function filter<A>(f: (x: Code<A>) => Code<boolean>) {
  return (stream: Stream<A>) => {
    const filter_stream = (a: Code<A>) => Unfold(k => k(a), f, Card.AtMostOne, (a, k) => k(a));
    return flatmap_raw((a) => Linear(filter_stream(a)), stream);
  };
}

function embed<A>(arr: A) {
  return JSON.stringify(arr) as Code<A>;
}

function asRef<A>(x: A): Code<A> {
  Count.refs.push(x);
  return `REF[${Count.refs.length - 1}]` as Code<A>;
}

function make<A>(code: () => Code<A>) {
  const tmp = Count;
  Count = {
    var: 0,
    refs: [],
  }
  const res = code();
  const body = Function("ARGS", "REF", res) as (ARGS: any[], REF: any[]) => A;
  const refs = Count.refs;
  Count = tmp;
  return {
    refs, body,
    run: (...args: any[]) => body(args, refs),
  }
}

export { toStream, map, fold, to_unfold, unfold, flatmap, filter, embed, asRef, make };