enum Card {
  AtMostOne = 0,
  Many = 1,
}
type Unit = undefined

declare const __nominal__type: unique symbol;
type Code<A> = string & { readonly [__nominal__type]: A; }

type MatchFor<A, R> = <S>(
  init: <W>(k: (s: S) => Code<W>) => Code<W>,
  bound: (arr: S) => Code<number>,
  index: (arr: S, i: Code<number>, k: (a: A) => Code<Unit>) => Code<Unit>
) => R
interface For<A> {
  match: <R>(opts: {
    "For": MatchFor<A, R>
  }) => R,
}
type MatchUnfold<A, R> = <S>(
  init: <W>(k: (s: S) => Code<W>) => Code<W>,
  term: (arr: S) => Code<boolean>,
  card: Card,
  step: (arr: S, k: (a: A) => Code<Unit>) => Code<Unit>
) => R
interface Unfold<A> {
  match: <R>(opts: {
    "Unfold": MatchUnfold<A, R>
  }) => R,
}
type Producer<A> = For<A> | Unfold<A>

type MatchLinear<A, R> = (producer: Producer<A>) => R
interface Linear<A> {
  match: <R>(opts: {
    "Linear": MatchLinear<A, R>
  }) => R,
}
type MatchNested<A, R> = <B>(
  outer: Producer<B>,
  step: (state: B) => StStream<A>
) => R
interface Nested<A> {
  match: <R>(opts: {
    "Nested": MatchNested<A, R>
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
function Linear<A>(prod: Producer<A>): Linear<A> {
  const obj = {
    prod,
    match: <R>(opts: { Linear: MatchLinear<A, R> }) => opts.Linear(prod),
  };
  return Object.freeze(obj);
}

function Nested<A, B>(outer: Producer<B>, step: (a: B) => StStream<A>): Nested<A> {
  const obj = {
    outer,
    step,
    match: <R>(opts: { Nested: MatchNested<A, R> }) => opts.Nested(outer, step),
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

function var_initU<S, W>(k: (s: Code<S>) => Code<W>, initial: Code<S>): Code<W> {
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
  init: <W>(k: (s: S) => Code<W>) => Code<W>,
  bound: (arr: S) => Code<number>,
  index: (arr: S, i: Code<number>, k: (a: A) => Code<Unit>) => Code<Unit>
): For<A> {
  const obj = {
    init,
    bound,
    index,
    match: <R>(opts: { For: MatchFor<A, R> }) => opts.For(init, bound, index),
    // take_raw: (n) => {
    //   const nbound = (s: S) => `Math.min(${n}-1, ${bound(s)})` as Code<number>;
    //   return For(init, nbound, index);
    // }
  };
  return Object.freeze(obj);
}

function Unfold<A, S>(
  init: <W>(k: (s: S) => Code<W>) => Code<W>,
  term: (arr: S) => Code<boolean>,
  card: Card,
  step: (arr: S, k: (a: A) => Code<Unit>) => Code<Unit>
): Unfold<A> {
  const obj = {
    init,
    term,
    card,
    step,
    match: <R>(opts: { Unfold: MatchUnfold<A, R> }) => opts.Unfold(init, term, card, step),
  };
  return Object.freeze(obj);
}

// Helper functions
function toStream<A>(arr: Code<A[]>): Stream<A> {
  const init = <W>(k: (s: Code<A[]>) => Code<W>): Code<W> => const_init(arr, k);
  const bound = (arr: Code<A[]>) => `${arr}.length - 1` as Code<number>;
  const index = (arr: Code<A[]>, i: Code<number>, k: (a: Code<A>) => Code<Unit>) => {
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
    return `if (${s} === undefined) return; const [${el}, ${s1}] = ${s}; ${s} = ${prod(s1)}; ${body(el)}` as Code<Unit>;
  };
  return Linear(Unfold(init, term, Card.Many, step));
}

// Consumers
function fold_raw<A>(consumer: (a: A) => Code<Unit>, stream: StStream<A>): Code<Unit> {
  return stream.match({
    Linear: (prod) => prod.match({
      For: (init, bound, index) => {
        const i = mkVar("i");
        return init((sp) => for_loop(i, bound(sp), index(sp, i, consumer)));
      },
      Unfold: (init, term, card, step) => {
        if (card === Card.AtMostOne)
          return init((sp) => if_loop(term(sp), step(sp, consumer)));
        return init((sp) => while_loop(term(sp), step(sp, consumer)));
      },
    }),
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

const forEach = <A>(f: (a: Code<A>) => Code<Unit>) => (stream: Stream<A>) => fold_raw(f, stream)

// Transformers
function map_raw<A, B>(
  tr: (a: A, k: (s: B) => Code<Unit>) => Code<Unit>,
  stream: StStream<A>
): StStream<B> {
  return stream.match({
    Linear: (prod) => Linear(prod.match({
      For: (init, bound, index) =>
        For(init, bound, (s, i, k) => index(s, i, (e) => tr(e, k))) as Producer<B>,
      Unfold: (init, term, card, step) =>
        Unfold(init, term, card, (s, k) => step(s, (e) => tr(e, k))),
    })) as StStream<B>,
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
const flatmap = <A, B>(tr: (a: Code<A>) => Stream<B>) => (stream: Stream<A>) => flatmap_raw(tr, stream);

function filter<A>(f: (x: Code<A>) => Code<boolean>) {
  return (stream: Stream<A>): Stream<A> => {
    const filter_stream = (a: Code<A>): Unfold<Code<A>> => Unfold(k => k(a), f, Card.AtMostOne, (a, k) => k(a));
    return flatmap_raw((a) => Linear(filter_stream(a)), stream);
  };
}

function to_unfold<A>(prod: Producer<A>): Unfold<A> {
  return prod.match({
    For: <S>(
      init: <W>(k: (s: S) => Code<W>) => Code<W>,
      bound: (arr: S) => Code<number>,
      index: (arr: S, i: Code<number>, k: (a: A) => Code<Unit>) => Code<Unit>
    ) =>
      Unfold(
        (k) => init(var_init0(k)),
        ([i, s0]: [Code<number>, S]) => `${i} <= ${bound(s0)}` as Code<boolean>,
        Card.Many,
        ([i, s0]: [Code<number>, S], k) => index(s0, i, (a) => var_inc(i, k(a)))
      ),
    Unfold: () => prod as Unfold<A>,
  });
}

function add_to_producer<A>(newTerm: Code<boolean>, prod: Producer<A>): Producer<A> {
  return prod.match({
    For: () => add_to_producer(newTerm, to_unfold(prod)),
    Unfold: (init, term, card, step) => {
      if (card === Card.AtMostOne) return prod;
      return Unfold(init, (s) => `${newTerm} && ${term(s)}` as Code<boolean>, Card.Many, step);
    },
  });
}

function addTermination<A>(newTerm: Code<boolean>, stream: StStream<A>): StStream<A> {
  return stream.match({
    Linear: (prod) => Linear(add_to_producer(newTerm, prod)) as StStream<A>,
    Nested: (outer, step) => Nested(add_to_producer(newTerm, outer), (a) => addTermination(newTerm, step(a))),
  });
}

function add_nr<A, S>(
  n: Code<number>,
  init: <W>(k: (s: S) => Code<W>) => Code<W>,
  term: (arr: S) => Code<boolean>,
  card: Card,
  step: (arr: S, k: (a: A) => Code<Unit>) => Code<Unit>
): Unfold<[Code<number>, A]> {
  const ninit = <W>(k: (s: [Code<number>, S]) => Code<W>) => init((s: S) => {
    const nr = mkVar("nr");
    return `let ${nr} = ${n}; ${k([nr, s])}` as Code<W>;
  });
  return Unfold(
    ninit,
    ([nr, s]: [Code<number>, S]) =>
      card === Card.AtMostOne
        ? term(s)
        : `${nr} > 0 && ${term(s)}` as Code<boolean>,
    card,
    ([nr, s]: [Code<number>, S], k: (s: [Code<number>, A]) => Code<Unit>) =>
      step(s, el => k([nr, el]))
  );
}

function take_raw<A>(n: Code<number>, stream: StStream<A>): StStream<A> {
  return stream.match({
    Linear: (prod) => prod.match({
      For: (init, bound, index) =>
        Linear(For(init, (s) => `Math.min(${n}-1, ${bound(s)})` as Code<number>, index)) as StStream<A>,
      Unfold: (init, term, card, step) =>
        map_raw(
          ([nr, a], k) => `${nr} -= 1; ${k(a)}` as Code<Unit>,
          Linear(add_nr(n, init, term, card, step))
        )
    }),
    Nested: (outer, step) => to_unfold(outer).match({
      Unfold: (init, term, card, step1) =>
        Nested(
          add_nr(n, init, term, card, step1),
          ([nr, a]) => map_raw(
            (a, k) => `${nr} -= 1; ${k(a)}` as Code<Unit>,
            addTermination(`${nr} > 0` as Code<boolean>, step(a))
          )
        ),
    }),
  });
}
const take = <A>(n: Code<number>) => (stream: StStream<A>) => take_raw(n, stream);

// zips: the hard part

// function zip_two_for<A, B, S1, S2>(
//   p1: For<A, S1>,
//   p2: For<B, S2>
// ): For<[A, B], [S1, S2]> {
//   return For(
//     (k) => p1.init((s1) => p2.init((s2) => k([s1, s2]))),
//     ([s1, s2]) => `Math.min(${p1.bound(s1)}, ${p2.bound(s2)})` as Code<number>,
//     ([s1, s2], i, k) => p1.index(s1, i, (a1) => p2.index(s2, i, (a2) => k([a1, a2])))
//   )
// }

// function zip_two_unfold<A, B, S1, S2>(
//   p1: Unfold<A, S1>,
//   p2: Unfold<B, S2>
// ): Unfold<[A, B], [S1, S2]> {
//   return Unfold(
//     (k) => p1.init((s1) => p2.init((s2) => k([s1, s2]))),
//     ([s1, s2]) => `${p1.term(s1)} && ${p2.term(s2)}` as Code<boolean>,
//     Card.Many,
//     ([s1, s2], k) => p1.step(s1, (a1) => p2.step(s2, (a2) => k([a1, a2])))
//   )
// }

// function push_linear<A, B, C, S1, S2>(
//   p1: Unfold<A, S1>,
//   p2: Unfold<B, S2>,
//   f: (x: B) => StStream<C>
// ): StStream<[A, C]> {
//   return Nested(
//     Unfold(
//       (k) => p1.init(s1 => p2.init(s2 => {
//         const term1r = mkVar("term1r");
//         return `let ${term1r} = ${p1.term(s1)}; ${k([term1r, s1, s2])}` as Code<Unit>;
//       })),
//       ([term1r, s1, s2]) => `${term1r} && ${p2.term(s2)}` as Code<boolean>,
//       Card.Many,
//       ([term1r, s1, s2], k) => p2.step(s2, b => k([term1r, s1, b])),
//     ),
//     ([term1r, s1, b]) => map_raw(
//       (c, k) => p1.step(
//         s1,
//         a => `${term1r} = ${p1.term(s1)}; ${k([a, c])}` as Code<Unit>
//       ),
//       addTermination(term1r, f(b))
//     )
//   )
// }
// code generation

function embed<A>(x: A) {
  return JSON.stringify(x) as Code<A>;
}

function asRef<A>(x: A): Code<A> {
  Count.refs.push(x);
  return `REF[${Count.refs.length - 1}]` as Code<A>;
}

function make<A>(n: number, code: (...args: Code<any>[]) => Code<A>) {
  const tmp = Count;
  Count = {
    var: 0,
    refs: [],
  }
  const args = Array.from({ length: n }, (_, i) => `ARG${i}` as Code<any>);
  const res = code(...args);
  const body = Function("REF", ...args, res) as (REF: any[], ...args: any[]) => A;
  const refs = Count.refs;
  Count = tmp;
  return {
    refs, body,
    run: (...args: any[]) => body(refs, ...args,),
  }
}

export {
  // producers
  toStream,
  unfold,
  // consumers
  fold,
  forEach,
  // transformers
  map,
  flatmap,
  filter,
  take,
  // code generation
  embed,
  asRef,
  make
};