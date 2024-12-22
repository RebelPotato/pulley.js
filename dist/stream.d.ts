declare enum Card {
    AtMostOne = 0,
    Many = 1
}
type Unit = undefined;
declare const __nominal__type: unique symbol;
type Code<A> = string & {
    readonly [__nominal__type]: A;
};
interface Init<S> {
    init: <W>(k: (s: S) => Code<W>) => Code<W>;
}
interface For<A, S> extends Init<S> {
    bound: (arr: S) => Code<number>;
    index: (arr: S, i: Code<number>, k: (a: A) => Code<Unit>) => Code<Unit>;
    to_unfold: () => Unfold<A, [Code<number>, S]>;
    fold_raw: (consumer: (a: A) => Code<Unit>) => Code<Unit>;
    map_raw: <B>(tr: (a: A, k: (s: B) => Code<Unit>) => Code<Unit>) => For<B, S>;
    add_to_producer: (newTerm: Code<boolean>) => Unfold<A, [Code<number>, S]>;
    take_raw: (n: Code<number>) => For<A, S>;
    match: <R>(opts: {
        "For": (init: <W>(k: (s: S) => Code<W>) => Code<W>, bound: (arr: S) => Code<number>, index: (arr: S, i: Code<number>, k: (a: A) => Code<Unit>) => Code<Unit>) => R;
    }) => R;
}
interface Unfold<A, S> extends Init<S> {
    term: (arr: S) => Code<boolean>;
    card: Card;
    step: (arr: S, k: (a: A) => Code<Unit>) => Code<Unit>;
    to_unfold: () => Unfold<A, S>;
    fold_raw: (consumer: (a: A) => Code<Unit>) => Code<Unit>;
    map_raw: <B>(tr: (a: A, k: (s: B) => Code<Unit>) => Code<Unit>) => Unfold<B, S>;
    add_to_producer: (newTerm: Code<boolean>) => Unfold<A, S>;
    add_nr: (n: Code<number>) => Unfold<[Code<number>, A], [Code<number>, S]>;
    take_raw: (n: Code<number>) => Unfold<A, [Code<number>, S]>;
    match: <R>(opts: {
        "Unfold": (init: <W>(k: (s: S) => Code<W>) => Code<W>, term: (arr: S) => Code<boolean>, card: Card, step: (arr: S, k: (a: A) => Code<Unit>) => Code<Unit>) => R;
    }) => R;
}
type Producer<A, S> = For<A, S> | Unfold<A, S>;
interface Linear<A> {
    prod: Producer<A, any>;
    match: <R>(opts: {
        "Linear": (producer: Producer<A, any>) => R;
    }) => R;
}
interface Nested<A> {
    outer: Producer<any, any>;
    step: (a: any) => StStream<A>;
    match: <R>(opts: {
        "Nested": <B>(outer: Producer<B, any>, step: (state: B) => StStream<A>) => R;
    }) => R;
}
type StStream<A> = Linear<A> | Nested<A>;
type Stream<A> = StStream<Code<A>>;
declare function Linear<A>(prod: Producer<A, any>): Linear<A>;
declare function Nested<A, B>(outer: Producer<B, any>, step: (a: B) => StStream<A>): Nested<A>;
declare function For<A, S>(init: For<A, S>["init"], bound: For<A, S>["bound"], index: For<A, S>["index"]): For<A, S>;
declare function Unfold<A, S>(init: Unfold<A, S>["init"], term: Unfold<A, S>["term"], card: Unfold<A, S>["card"], step: Unfold<A, S>["step"]): Unfold<A, S>;
declare function toStream<A>(arr: Code<A[]>): Stream<A>;
declare function unfold<A, Z>(prod: (x: Code<Z | undefined>) => Code<[A, Z] | undefined>, initial: Code<Z | undefined>): Stream<A>;
declare function fold<A, Z>(f: (s: Code<Z>, a: Code<A>) => Code<Z>, z: Code<Z>): (stream: Stream<A>) => Code<Z>;
declare const forEach: <A>(f: (a: Code<A>) => Code<Unit>) => (stream: Stream<A>) => Code<undefined>;
declare function map<A, B>(f: (x: Code<A>) => Code<B>): (s: Stream<A>) => Stream<B>;
declare const flatmap: <A, B>(tr: (a: A) => StStream<B>) => (stream: StStream<A>) => StStream<B>;
declare function filter<A>(f: (x: Code<A>) => Code<boolean>): (stream: Stream<A>) => StStream<unknown>;
declare const take: <A>(n: Code<number>) => (stream: StStream<A>) => StStream<A>;
declare function embed<A>(x: A): Code<A>;
declare function asRef<A>(x: A): Code<A>;
declare function make<A>(n: number, code: (...args: Code<any>[]) => Code<A>): {
    refs: any[];
    body: (REF: any[], ...args: any[]) => A;
    run: (...args: any[]) => A;
};
export { toStream, unfold, fold, forEach, map, flatmap, filter, take, embed, asRef, make };
