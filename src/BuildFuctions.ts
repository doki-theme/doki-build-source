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
  StringDictionary,
} from "./types";

export interface EvaluateArgs {
  currentWorkingDirectory: string;
  appName: string;
}

export const evaluateTemplates = <T extends BaseAppDokiThemeDefinition, R>(
  evaluateArgs: EvaluateArgs,
  createDokiTheme: (
    masterThemeDefinitionPath: string,
    masterThemeDefinition: MasterDokiThemeDefinition,
    appTemplateDefinitions: DokiThemeDefinitions,
    appThemeDefinition: T,
    masterTemplateDefinitions: DokiThemeDefinitions,
  ) => R
): Promise<R[]> => {
  const {
    appDefinitionDirectoryPath,
    masterThemeDefinitionDirectoryPath,
    masterTemplateDirectoryPath,
    appTemplatesDirectoryPath,
  } = resolvePaths(evaluateArgs.currentWorkingDirectory);

  const { appName } = evaluateArgs;

  return walkDir(masterTemplateDirectoryPath)
    .then(readTemplates)
    .then((masterTemplateDefinitions) =>
      walkDir(appDefinitionDirectoryPath)
        .then((files) =>
          files.filter((file) => file.endsWith(`${appName}.definition.json`))
        )
        .then((appThemeDefinitionPaths) => {
          return {
            masterTemplateDefinitions,
            appThemeDefinitions: appThemeDefinitionPaths
              .map((appThemeDefinitionPath) =>
                readJson<T>(appThemeDefinitionPath)
              )
              .reduce((accum: StringDictionary<T>, def) => {
                accum[def.id] = def;
                return accum;
              }, {}),
          };
        })
    )
    .then(({
      masterTemplateDefinitions,
      appThemeDefinitions,
    }) =>
      walkDir(appTemplatesDirectoryPath)
        .then(readTemplates)
        .then((appTemplateDefinitions) => {
          return walkDir(
            path.resolve(masterThemeDefinitionDirectoryPath, "definitions")
          )
            .then((files) =>
              files.filter((file) => file.endsWith("master.definition.json"))
            )
            .then((masterThemeDefinitionPaths) => {
              return {
                masterTemplateDefinitions,
                appThemeDefinitions,
                appTemplateDefinitions,
                masterThemeDefinitionPaths,
              };
            });
        })
    )

    .then((templatesAndDefinitions) => {
      const {
        masterTemplateDefinitions,
        appTemplateDefinitions,
        appThemeDefinitions,
        masterThemeDefinitionPaths,
      } = templatesAndDefinitions;

      return masterThemeDefinitionPaths
        .map((masterThemeDefinitionPath) => {
          const masterThemeDefinition = readJson<MasterDokiThemeDefinition>(
            masterThemeDefinitionPath
          );
          const appThemeDefinition =
            appThemeDefinitions[masterThemeDefinition.id];
          if (!appThemeDefinition) {
            throw new Error(
              `${masterThemeDefinition.displayName}'s theme does not have a ${
                evaluateArgs.appName
              } Definition!!`
            );
          }
          return {
            masterThemeDefinitionPath,
            masterThemeDefinition,
            appThemeDefinition,
          };
        })
        .filter(
          (pathAndDefinition) =>
            (pathAndDefinition.masterThemeDefinition.product === "ultimate" &&
              process.env.PRODUCT === "ultimate") ||
            pathAndDefinition.masterThemeDefinition.product !== "ultimate"
        )
        .map(
          ({
            masterThemeDefinitionPath,
            masterThemeDefinition,
            appThemeDefinition,
          }) =>
            createDokiTheme(
              masterThemeDefinitionPath,
              masterThemeDefinition,
              appTemplateDefinitions,
              appThemeDefinition,
              masterTemplateDefinitions,
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

  const masterTemplateDirectoryPath = path.resolve(
    masterThemeDefinitionDirectoryPath,
    "templates"
  );

  const appDefinitionDirectoryPath = path.resolve(
    repoDirectory,
    "buildSrc",
    "assets",
    "themes"
  );

  const templateDirectoryPath = path.resolve(
    repoDirectory,
    "buildSrc",
    "assets",
    "templates"
  );

  return {
    repoDirectory,
    masterThemeDefinitionDirectoryPath,
    masterTemplateDirectoryPath,
    appDefinitionDirectoryPath,
    appTemplatesDirectoryPath: templateDirectoryPath,
  };
}
