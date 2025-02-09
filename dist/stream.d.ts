declare enum Card {
    AtMostOne = 0,
    Many = 1
}
type Unit = undefined;
declare const __nominal__type: unique symbol;
type Code<A> = string & {
    readonly [__nominal__type]: A;
};
type MatchFor<A, R> = <S>(init: <W>(k: (s: S) => Code<W>) => Code<W>, bound: (arr: S) => Code<number>, index: (arr: S, i: Code<number>, k: (a: A) => Code<Unit>) => Code<Unit>) => R;
interface For<A> {
    match: <R>(opts: {
        For: MatchFor<A, R>;
    }) => R;
}
type MatchUnfold<A, R> = <S>(init: <W>(k: (s: S) => Code<W>) => Code<W>, term: (arr: S) => Code<boolean>, card: Card, step: (arr: S, k: (a: A) => Code<Unit>) => Code<Unit>) => R;
interface Unfold<A> {
    match: <R>(opts: {
        Unfold: MatchUnfold<A, R>;
    }) => R;
}
type Producer<A> = For<A> | Unfold<A>;
type MatchLinear<A, R> = (producer: Producer<A>) => R;
interface Linear<A> {
    match: <R>(opts: {
        Linear: MatchLinear<A, R>;
    }) => R;
}
type MatchNested<A, R> = <B>(outer: Producer<B>, step: (state: B) => StStream<A>) => R;
interface Nested<A> {
    match: <R>(opts: {
        Nested: MatchNested<A, R>;
    }) => R;
}
type StStream<A> = Linear<A> | Nested<A>;
type Stream<A> = StStream<Code<A>>;
declare function Linear<A>(prod: Producer<A>): Linear<A>;
declare function Nested<A, B>(outer: Producer<B>, step: (a: B) => StStream<A>): Nested<A>;
declare function For<A, S>(init: <W>(k: (s: S) => Code<W>) => Code<W>, bound: (arr: S) => Code<number>, index: (arr: S, i: Code<number>, k: (a: A) => Code<Unit>) => Code<Unit>): For<A>;
declare function Unfold<A, S>(init: <W>(k: (s: S) => Code<W>) => Code<W>, term: (arr: S) => Code<boolean>, card: Card, step: (arr: S, k: (a: A) => Code<Unit>) => Code<Unit>): Unfold<A>;
declare function toStream<A>(arr: Code<A[]>): Stream<A>;
declare function unfold<A, Z>(prod: (x: Code<Z | undefined>) => Code<[A, Z] | undefined>, initial: Code<Z | undefined>): Stream<A>;
declare function fold<A, Z>(f: (s: Code<Z>, a: Code<A>) => Code<Z>, z: Code<Z>): (stream: Stream<A>) => Code<Z>;
declare const forEach: <A>(f: (a: Code<A>) => Code<Unit>) => (stream: Stream<A>) => Code<undefined>;
declare function map<A, B>(f: (x: Code<A>) => Code<B>): (s: Stream<A>) => Stream<B>;
declare const flatmap: <A, B>(tr: (a: Code<A>) => Stream<B>) => (stream: Stream<A>) => StStream<Code<B>>;
declare function filter<A>(f: (x: Code<A>) => Code<boolean>): (stream: Stream<A>) => Stream<A>;
declare const take: <A>(n: Code<number>) => (stream: StStream<A>) => StStream<A>;
declare function zipWith<A, B, C>(f: (a: Code<A>, b: Code<B>) => Code<C>): (s1: Stream<A>) => (s2: Stream<B>) => Stream<C>;
declare function embed<A>(x: A): Code<A>;
declare function asRef<A>(x: A): Code<A>;
declare function make<A>(n: number, code: (...args: Code<any>[]) => Code<A>): {
    refs: any[];
    body: (REF: any[], ...args: any[]) => A;
    run: (...args: any[]) => A;
};
export { toStream, unfold, fold, forEach, map, flatmap, filter, take, zipWith, Code, embed, asRef, make, };
