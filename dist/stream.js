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
    };
    return Object.freeze(obj);
}
function Unfold(init, term, card, step) {
    const obj = {
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
        map_raw: (tr) => Unfold(init, term, card, (s, k) => step(s, (e) => tr(e, k))),
    };
    return Object.freeze(obj);
}
// Helper functions
function to_unfold(prod) {
    return prod.to_unfold();
}
function toStream(arr) {
    const init = (k) => const_init(arr, k);
    const bound = (arr) => `(${arr}).length - 1`;
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
        return `if (${s} === undefined) return; const [${el}, ${s1}] = ${s}; s = ${prod(s1)}; ${body(el)}`;
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
const flatmap = flatmap_raw;
function filter(f) {
    return (stream) => {
        const filter_stream = (a) => Unfold(k => k(a), f, Card.AtMostOne, (a, k) => k(a));
        return flatmap_raw((a) => Linear(filter_stream(a)), stream);
    };
}
function embed(arr) {
    return JSON.stringify(arr);
}
function asRef(x) {
    Count.refs.push(x);
    return `REF[${Count.refs.length - 1}]`;
}
function make(code) {
    const tmp = Count;
    Count = {
        var: 0,
        refs: [],
    };
    const res = code();
    const body = Function("ARGS", "REF", res);
    const refs = Count.refs;
    Count = tmp;
    return {
        refs, body,
        run: (...args) => body(args, refs),
    };
}
export { toStream, map, fold, to_unfold, unfold, flatmap, filter, embed, asRef, make };
