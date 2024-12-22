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
        to_unfold: () => {
            const uinit = (k) => init(var_init0(k));
            const term = ([i, s0]) => `${i} <= ${bound(s0)}`;
            const step = ([i, s0], k) => index(s0, i, (a) => var_inc(i, k(a)));
            return Unfold(uinit, term, Card.Many, step);
        },
        fold_raw: (consumer) => {
            const i = mkVar("i");
            return init((sp) => for_loop(i, bound(sp), index(sp, i, consumer)));
        },
        map_raw: (tr) => For(init, bound, (s, i, k) => index(s, i, (e) => tr(e, k))),
        add_to_producer: (newTerm) => obj.to_unfold().add_to_producer(newTerm),
        take_raw: (n) => {
            const nbound = (s) => `Math.min(${n}-1, ${bound(s)})`;
            return For(init, nbound, index);
        }
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
        to_unfold: () => obj,
        fold_raw: (consumer) => {
            if (card === Card.AtMostOne)
                return init((sp) => if_loop(term(sp), step(sp, consumer)));
            return init((sp) => while_loop(term(sp), step(sp, consumer)));
        },
        map_raw: (tr) => Unfold(init, term, card, (s, k) => step(s, (e) => tr(e, k))),
        add_to_producer: (newTerm) => {
            if (card === Card.AtMostOne)
                return obj;
            const nterm = (s) => `${newTerm} && ${term(s)}`;
            return Unfold(init, nterm, Card.Many, step);
        },
        add_nr: (n) => {
            const ninit = (k) => init((s) => {
                const nr = mkVar("nr");
                return `let ${nr} = ${n}; ${k([nr, s])}`;
            });
            return Unfold(ninit, ([nr, s]) => card === Card.AtMostOne
                ? term(s)
                : `${nr} > 0 && ${term(s)}`, card, ([nr, s], k) => step(s, el => k([nr, el])));
        },
        take_raw: (n) => obj.add_nr(n).map_raw(([nr, a], k) => `${nr} -= 1; ${k(a)}`),
    };
    return Object.freeze(obj);
}
// Helper functions
function toStream(arr) {
    const init = (k) => const_init(arr, k);
    const bound = (arr) => `${arr}.length - 1`;
    const index = (arr, i, k) => {
        const vel = mkVar("el");
        return `const ${vel} = ${arr}[${i}]; ${k(vel)}`;
    };
    return Linear(For(init, bound, index));
}
function unfold(prod, initial) {
    const init = (k) => var_initU(k, prod(initial));
    const term = (s) => `${s} !== undefined`;
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
        Linear: (prod) => prod.fold_raw(consumer),
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
        Linear: (prod) => Linear(prod.map_raw(tr)),
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
        const filter_stream = (a) => Unfold(k => k(a), f, Card.AtMostOne, (a, k) => k(a));
        return flatmap_raw((a) => Linear(filter_stream(a)), stream);
    };
}
function addTermination(newTerm, stream) {
    return stream.match({
        Linear: (prod) => Linear(prod.add_to_producer(newTerm)),
        Nested: (outer, step) => Nested(outer.add_to_producer(newTerm), (a) => addTermination(newTerm, step(a))),
    });
}
function take_raw(n, stream) {
    return stream.match({
        Linear: (prod) => Linear(prod.take_raw(n)),
        Nested: (outer, step) => Nested(outer.to_unfold().add_nr(n), ([nr, a]) => map_raw((a, k) => `${nr} -= 1; ${k(a)}`, addTermination(`${nr} > 0`, step(a)))),
    });
}
const take = (n) => (stream) => take_raw(n, stream);
// zips: the hard part
function zip_two_for(p1, p2) {
    return For((k) => p1.init((s1) => p2.init((s2) => k([s1, s2]))), ([s1, s2]) => `Math.min(${p1.bound(s1)}, ${p2.bound(s2)})`, ([s1, s2], i, k) => p1.index(s1, i, (a1) => p2.index(s2, i, (a2) => k([a1, a2]))));
}
function zip_two_unfold(p1, p2) {
    return Unfold((k) => p1.init((s1) => p2.init((s2) => k([s1, s2]))), ([s1, s2]) => `${p1.term(s1)} && ${p2.term(s2)}`, Card.Many, ([s1, s2], k) => p1.step(s1, (a1) => p2.step(s2, (a2) => k([a1, a2]))));
}
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
        refs, body,
        run: (...args) => body(refs, ...args),
    };
}
export { 
// producers
toStream, unfold, 
// consumers
fold, forEach, 
// transformers
map, flatmap, filter, take, 
// code generation
embed, asRef, make };
