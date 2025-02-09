var Card;
(function (Card) {
    Card[Card["AtMostOne"] = 0] = "AtMostOne";
    Card[Card["Many"] = 1] = "Many";
})(Card || (Card = {}));
// Counter for variable names
let Count = {
    var: 0,
    refs: [],
};
function mkVar(name) {
    const count = Count.var;
    Count.var += 1;
    return `${name}_${count}`;
}
// Stream constructors
function Linear(prod) {
    const obj = {
        prod,
        match: (opts) => opts.Linear(prod),
    };
    return Object.freeze(obj);
}
function Nested(outer, step) {
    const obj = {
        outer,
        step,
        match: (opts) => opts.Nested(outer, step),
    };
    return Object.freeze(obj);
}
// Code generation helpers
function var_init0(k) {
    return (s0) => {
        const i = mkVar("i");
        return `let ${i} = 0; ${k([i, s0])}`;
    };
}
function var_initU(k, initial) {
    const s = mkVar("s");
    return `let ${s} = ${initial}; ${k(s)}`;
}
function var_inc(i, rest) {
    return `${i} += 1; ${rest}`;
}
function for_loop(i, term, body) {
    return `for (let ${i} = 0; ${i} <= ${term}; ${i}++) { ${body} }`;
}
function if_loop(cond, body) {
    return `if(${cond}) { ${body} }`;
}
function while_loop(cond, body) {
    return `while(${cond}) { ${body} }`;
}
function const_init(arr, k) {
    const varr = mkVar("arr");
    return `const ${varr} = ${arr}; ${k(varr)}`;
}
// Producers
function For(init, bound, index) {
    const obj = {
        init,
        bound,
        index,
        match: (opts) => opts.For(init, bound, index),
    };
    return Object.freeze(obj);
}
function Unfold(init, term, card, step) {
    const obj = {
        init,
        term,
        card,
        step,
        match: (opts) => opts.Unfold(init, term, card, step),
    };
    return Object.freeze(obj);
}
// Helper functions
function toStream(arr) {
    const init = (k) => const_init(arr, k);
    const bound = (arr) => `(${arr}.length - 1)`;
    const index = (arr, i, k) => {
        const vel = mkVar("el");
        return `const ${vel} = ${arr}[${i}]; ${k(vel)}`;
    };
    return Linear(For(init, bound, index));
}
function unfold(prod, initial) {
    const init = (k) => var_initU(k, prod(initial));
    const term = (s) => `(${s} !== undefined)`;
    const step = (s, body) => {
        const el = mkVar("el");
        const s1 = mkVar("s1");
        return `if (${s} === undefined) return; const [${el}, ${s1}] = ${s}; ${s} = ${prod(s1)}; ${body(el)}`;
    };
    return Linear(Unfold(init, term, Card.Many, step));
}
// Consumers
function fold_raw(consumer, stream) {
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
        Nested: (outer, step) => fold_raw((e) => fold_raw(consumer, step(e)), Linear(outer)),
    });
}
function fold(f, z) {
    return (stream) => {
        const s = mkVar("s");
        return `let ${s} = ${z}; ${fold_raw((a) => `${s} = ${f(s, a)};`, stream)}; return ${s};`;
    };
}
const forEach = (f) => (stream) => fold_raw(f, stream);
// Transformers
function map_raw(tr, stream) {
    return stream.match({
        Linear: (prod) => Linear(prod.match({
            For: (init, bound, index) => For(init, bound, (s, i, k) => index(s, i, (e) => tr(e, k))),
            Unfold: (init, term, card, step) => Unfold(init, term, card, (s, k) => step(s, (e) => tr(e, k))),
        })),
        Nested: (outer, step) => Nested(outer, (a) => map_raw(tr, step(a))),
    });
}
function map(f) {
    return (stream) => {
        const t = mkVar("t");
        return map_raw((a, k) => `const ${t} = ${f(a)}; ${k(t)}`, stream);
    };
}
function flatmap_raw(tr, stream) {
    return stream.match({
        Linear: (prod) => Nested(prod, tr),
        Nested: (outer, step) => Nested(outer, (a) => flatmap_raw(tr, step(a))),
    });
}
const flatmap = (tr) => (stream) => flatmap_raw(tr, stream);
function filter(f) {
    return (stream) => {
        const filter_stream = (a) => Unfold((k) => k(a), f, Card.AtMostOne, (a, k) => k(a));
        return flatmap_raw((a) => Linear(filter_stream(a)), stream);
    };
}
function to_unfold(prod) {
    return prod.match({
        For: (init, bound, index) => Unfold((k) => init(var_init0(k)), ([i, s0]) => `(${i} <= ${bound(s0)})`, Card.Many, ([i, s0], k) => index(s0, i, (a) => var_inc(i, k(a)))),
        Unfold: () => prod,
    });
}
function add_to_producer(newTerm, prod) {
    return prod.match({
        For: () => add_to_producer(newTerm, to_unfold(prod)),
        Unfold: (init, term, card, step) => {
            if (card === Card.AtMostOne)
                return prod;
            return Unfold(init, (s) => `(${newTerm} && ${term(s)})`, Card.Many, step);
        },
    });
}
function add_termination(newTerm, stream) {
    return stream.match({
        Linear: (prod) => Linear(add_to_producer(newTerm, prod)),
        Nested: (outer, step) => Nested(add_to_producer(newTerm, outer), (a) => add_termination(newTerm, step(a))),
    });
}
function add_nr(n, init, term, card, step) {
    const ninit = (k) => init((s) => {
        const nr = mkVar("nr");
        return `let ${nr} = ${n}; ${k([nr, s])}`;
    });
    return Unfold(ninit, ([nr, s]) => card === Card.AtMostOne
        ? term(s)
        : `(${nr} > 0 && ${term(s)})`, card, ([nr, s], k) => step(s, (el) => k([nr, el])));
}
function take_raw(n, stream) {
    return stream.match({
        Linear: (prod) => prod.match({
            For: (init, bound, index) => Linear(For(init, (s) => `Math.min(${n}-1, ${bound(s)})`, index)),
            Unfold: (init, term, card, step) => map_raw(([nr, a], k) => `${nr} -= 1; ${k(a)}`, Linear(add_nr(n, init, term, card, step))),
        }),
        Nested: (outer, step) => to_unfold(outer).match({
            Unfold: (init, term, card, step1) => Nested(add_nr(n, init, term, card, step1), ([nr, a]) => map_raw((a, k) => `${nr} -= 1; ${k(a)}`, add_termination(`(${nr} > 0)`, step(a)))),
        }),
    });
}
const take = (n) => (stream) => take_raw(n, stream);
// zips: the hard part
function zip_producer(prod1, prod2) {
    return prod1.match({
        For: (init1, bound1, index1) => prod2.match({
            For: (init2, bound2, index2) => For((k) => init1((s1) => init2((s2) => k([s1, s2]))), ([s1, s2]) => `Math.min(${bound1(s1)}, ${bound2(s2)})`, ([s1, s2], i, k) => index1(s1, i, (a) => index2(s2, i, (b) => k([a, b])))),
            Unfold: () => zip_producer(to_unfold(prod1), to_unfold(prod2)),
        }),
        Unfold: (init1, term1, card1, step1) => prod2.match({
            For: () => zip_producer(to_unfold(prod1), to_unfold(prod2)),
            Unfold: (init2, term2, card2, step2) => Unfold((k) => init1((s1) => init2((s2) => k([s1, s2]))), ([s1, s2]) => `(${term1(s1)} && ${term2(s2)})`, Card.Many, ([s1, s2], k) => step1(s1, (a) => step2(s2, (b) => k([a, b])))),
        }),
    });
}
function push_linear(prod1, prod2, f) {
    return prod1.match({
        Unfold: (init1, term1, card1, step1) => prod2.match({
            Unfold: (init2, term2, card2, step2) => Nested(Unfold((k) => init1((s1) => init2((s2) => {
                const term1r = mkVar("term1r");
                return `let ${term1r} = ${term1(s1)}; ${k([
                    term1r,
                    s1,
                    s2,
                ])}`;
            })), ([term1r, s1, s2]) => `((${term1r}) && ${term2(s2)})`, Card.Many, ([term1r, s1, s2], k) => step2(s2, (b) => k([term1r, s1, b]))), ([term1r, s1, b]) => map_raw((c, k) => step1(s1, (a) => `${term1r} = ${term1(s1)}; ${k([a, c])}`), add_termination(`(${term1r})`, f(b)))),
        }),
    });
}
// function make_linear<A>(stream: StStream<A>): Producer<A> {
//   return stream.match({
//     Linear: (prod) => prod,
//     Nested: (outer, step) => outer.match({
//       For: () => make_linear(Nested(to_unfold(outer), step)),
//       Unfold: <S>(
//         init1: <W>(k: (s: S) => Code<W>) => Code<W>,
//         term1: (arr: S) => Code<boolean>,
//         card1: Card,
//         step1: (arr: S, k: (a: A) => Code<Unit>) => Code<Unit>
//       ) => {
//       }
//     })
//   })
// }
function zip_raw(stream1, stream2) {
    const err = () => {
        throw new Error("zip_raw: not implemented yet");
    };
    return stream1.match({
        Linear: (prod1) => stream2.match({
            Linear: (prod2) => Linear(zip_producer(prod1, prod2)),
            Nested: (outer2, step2) => push_linear(to_unfold(prod1), to_unfold(outer2), step2),
        }),
        Nested: (outer1, step1) => stream2.match({
            Linear: (prod2) => map_raw(([y, x], k) => k([x, y]), push_linear(to_unfold(prod2), to_unfold(outer1), step1)),
            Nested: (outer2, step2) => err(),
        }),
    });
}
function zipWith(f) {
    return (s1) => (s2) => map_raw(([a, b], k) => k(f(a, b)), zip_raw(s1, s2));
}
// code generation
function embed(x) {
    return JSON.stringify(x);
}
function asRef(x) {
    Count.refs.push(x);
    return `REF[${Count.refs.length - 1}]`;
}
function make(n, code) {
    const tmp = Count;
    Count = {
        var: 0,
        refs: [],
    };
    const args = Array.from({ length: n }, (_, i) => `ARG${i}`);
    const res = code(...args);
    const body = Function("REF", ...args, res);
    const refs = Count.refs;
    Count = tmp;
    return {
        refs,
        body,
        run: (...args) => body(refs, ...args),
    };
}
export { 
// producers
toStream, unfold, 
// consumers
fold, forEach, 
// transformers
map, flatmap, filter, take, zipWith, embed, asRef, make, };
