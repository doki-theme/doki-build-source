Doki Theme Build Source
---

You think I maintain 50+ themes manually? These are the common building blocks for constructing all the Doki themes

# Required Software

- Yarn Package Manager

# Getting Started

Once you have cloned this repository, you'll need to install the required dependencies to run
the [scripts defined here](https://github.com/doki-theme/doki-build-source/blob/main/package.json#L10).

This can be accomplished by running this command at the root of this repository:

```shell
yarn
```

# Developing

The bread and butter of this library needs to be created in order for this code base to be useful. Running the `build`
script will generate the `lib/` directory at the root of this repo that will contain all the transpiled typescript code.

```shell
yarn build
```

All the node scripts used by the various Doki theme plugins will be using the `Common JS` code.

## Handy Development Setup

If you have created a theme and need to make changes on the fly, you can
always [link](https://classic.yarnpkg.com/en/docs/cli/link/)
this repository into the `node_modules` of the plugin you are working on's `buildSrc` directory.

This can be accomplished by running this command at the root of this repository,

```shell
yarn link
```

Then to use this in, for instance, the VS-Code plugin, then you'll run this command
in `<your-workspace>/doki-theme-vscode/buildSrc` directory:

```shell
yarn link doki-build-source
```

However, that is half the battle. If you want to see your changes take place, you can run `yarn build` every time you
make changes. We do have technology though, `yarn watch:cjs` will start a process that will watch the typescript files
and transpile the new build javascript on changes.

It's also important to remember the above when you come back to a project and are wondering why you are not seeing your
changes in the build source.
