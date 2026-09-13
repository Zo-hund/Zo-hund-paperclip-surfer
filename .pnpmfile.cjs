// Better Auth's optional development-tool peers otherwise retain their entire
// build/test graphs in a production-only installation. Our authentication uses
// drizzle-orm, not drizzle-kit or Better Auth's Vitest test utilities. These
// tools remain explicit development dependencies of this workspace.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'better-auth' && pkg.version === '1.6.22') {
        for (const name of ['drizzle-kit', 'vitest']) {
          if (pkg.peerDependencies) delete pkg.peerDependencies[name];
          if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta[name];
        }
      }
      return pkg;
    },
  },
};
