export const curry = (fn: (...args: any) => any) => {
    const go = (...args: any) => {
        if (args.length >= fn.length) {
            return fn(...args);
        } else {
            return (...new_args: any) => go(...[...args, ...new_args])
        }
    }
    return go;
}