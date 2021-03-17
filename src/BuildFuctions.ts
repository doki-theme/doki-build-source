import path from "path";
import {
  walkDir,
  readJson,
  readTemplates,
  getRepoDirectory,
} from "./functions";
import {
  BaseAppDokiThemeDefinition,
  DokiThemeDefinitions,
  MasterDokiThemeDefinition,
  StringDictonary,
} from "./types";

export interface EvaluateArgs {
  currentWorkingDirectory: string;
  appName: string;
}

export const evaluateTemplates = <T extends BaseAppDokiThemeDefinition, R>(
  evaluateArgs: EvaluateArgs,
  createDokiTheme: (
    dokiFileDefinitionPath: string,
    dokiThemeDefinition: MasterDokiThemeDefinition,
    dokiTemplateDefinitions: DokiThemeDefinitions,
    dokiThemeAppDefinition: T
  ) => R,
): Promise<R[]> => {
  const {
    appDefinitionDirectoryPath,
    masterThemeDefinitionDirectoryPath,
  } = resolvePaths(evaluateArgs.currentWorkingDirectory);

  const { appName } = evaluateArgs;

  return walkDir(appDefinitionDirectoryPath)
    .then((files) =>
      files.filter((file) => file.endsWith(`${appName}.definition.json`))
    )
    .then((dokiThemeAppDefinitionPaths) => {
      return {
        dokiThemeAppDefinitions: dokiThemeAppDefinitionPaths
          .map((dokiThemeAppDefinitionPath) =>
            readJson<T>(dokiThemeAppDefinitionPath)
          )
          .reduce((accum: StringDictonary<T>, def) => {
            accum[def.id] = def;
            return accum;
          }, {}),
      };
    })
    .then(({ dokiThemeAppDefinitions }) =>
      walkDir(path.resolve(masterThemeDefinitionDirectoryPath, "templates"))
        .then(readTemplates)
        .then((dokiTemplateDefinitions) => {
          return walkDir(
            path.resolve(masterThemeDefinitionDirectoryPath, "definitions")
          )
            .then((files) =>
              files.filter((file) => file.endsWith("master.definition.json"))
            )
            .then((dokiFileDefinitionPaths) => {
              return {
                dokiThemeAppDefinitions,
                dokiTemplateDefinitions,
                dokiFileDefinitionPaths,
              };
            });
        })
    )

    .then((templatesAndDefinitions) => {
      const {
        dokiTemplateDefinitions,
        dokiThemeAppDefinitions,
        dokiFileDefinitionPaths,
      } = templatesAndDefinitions;

      return dokiFileDefinitionPaths
        .map((dokiFileDefinitionPath) => {
          const dokiThemeDefinition = readJson<MasterDokiThemeDefinition>(
            dokiFileDefinitionPath
          );
          const dokiThemeAppDefinition =
            dokiThemeAppDefinitions[dokiThemeDefinition.id];
          if (!dokiThemeAppDefinition) {
            throw new Error(
              `${dokiThemeDefinition.displayName}'s theme does not have a Jupyter Definition!!`
            );
          }
          return {
            dokiFileDefinitionPath,
            dokiThemeDefinition,
            dokiThemeAppDefinition,
          };
        })
        .filter(
          (pathAndDefinition) =>
            (pathAndDefinition.dokiThemeDefinition.product === "ultimate" &&
              process.env.PRODUCT === "ultimate") ||
            pathAndDefinition.dokiThemeDefinition.product !== "ultimate"
        )
        .map(
          ({
            dokiFileDefinitionPath,
            dokiThemeDefinition,
            dokiThemeAppDefinition,
          }) =>
            createDokiTheme(
              dokiFileDefinitionPath,
              dokiThemeDefinition,
              dokiTemplateDefinitions,
              dokiThemeAppDefinition
            )
        );
    });
};

export function resolvePaths(dirName: string) {
  const repoDirectory = getRepoDirectory(dirName);
  const masterThemeDefinitionDirectoryPath = path.resolve(
    repoDirectory,
    "masterThemes"
  );

  const appDefinitionDirectoryPath = path.resolve(
    repoDirectory,
    "buildSrc",
    "assets",
    "themes"
  );
  return {
    repoDirectory,
    masterThemeDefinitionDirectoryPath,
    appDefinitionDirectoryPath,
  };
}
