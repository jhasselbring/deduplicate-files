import minimist from 'minimist';

const argv = minimist(process.argv.slice(2), {
    string: ['target', 'name'],
    boolean: ['help'],
    number: ['min', 'max'],
    alias: {
        h: 'help',     
        d: 'dir',
        n: 'name',
        t: 'target',
        mn: 'min',
        mx: 'max'
    },
    default: {
        target: process.cwd().split(/[/\\]/).join('/'), // default to current working directory
        name: process.cwd().split(/[/\\]/).pop(),
        min: 0,
        max: 10
    }
});

let vars = {
    ...argv,
}
vars.base_dir = argv.target.split(/[/\\]/).slice(0,-1).join('/');
vars.duplicate_dir = vars.base_dir + '/' + vars.name + '_duplicates';
vars.db_name = vars.base_dir + '/' + vars.name + '_' + vars.min + '-' + vars.max + '.db';

export { argv as default, argv, vars }; 