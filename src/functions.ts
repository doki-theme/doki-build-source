import path from "path";
import fs from "fs";
import {
  BaseAppDokiThemeDefinition,
  DokiThemeDefinitions,
  MasterDokiThemeDefinition,
  StringDictionary,
} from "./types";
import { GroupToNameMapping } from "./GroupToNameMapping";
import { resolvePaths } from "./BuildFuctions";

type DokiTheme = {
  path: string;
  definition: MasterDokiThemeDefinition;
  stickers: { default: { path: string; name: string } };
  theme: {};
};

function getGroupName(dokiTheme: DokiTheme) {
  return GroupToNameMapping[dokiTheme.definition.group];
}

export function getDisplayName(dokiTheme: DokiTheme) {
  return `${getGroupName(dokiTheme)}${dokiTheme.definition.name}`;
}

export const getRepoDirectory = (dirname: string) =>
  path.resolve(dirname, "..", "..");

const LAF_TYPE = "laf";
const SYNTAX_TYPE = "syntax";
const NAMED_COLOR_TYPE = "colorz";

function getTemplateType(templatePath: string) {
  if (templatePath.endsWith("laf.template.json")) {
    return LAF_TYPE;
  } else if (templatePath.endsWith("syntax.template.json")) {
    return SYNTAX_TYPE;
  } else if (templatePath.endsWith("colors.template.json")) {
    return NAMED_COLOR_TYPE;
  }
  return undefined;
}


export const dictionaryReducer = <T>(
  accum: StringDictionary<T>,
  [key, value]: [string, T],
) => {
  accum[key] = value;
  return accum;
};

export function resolveStickerPath(
  themeDefinitionPath: string,
  sticker: string,
  currentDirectory: string,
) {
  const {
    masterThemeDefinitionDirectoryPath
  } = resolvePaths(currentDirectory)

  const stickerPath = path.resolve(
    path.resolve(themeDefinitionPath, '..'),
    sticker
  );
  return stickerPath.substr(masterThemeDefinitionDirectoryPath.length + '/definitions'.length);
}



function resolveTemplate<T, R>(
  childTemplate: T,
  templateNameToTemplate: StringDictionary<T>,
  attributeResolver: (t: T) => R,
  parentResolver: (t: T) => string
): R {
  if (!parentResolver(childTemplate)) {
    return attributeResolver(childTemplate);
  } else {
    const parent = templateNameToTemplate[parentResolver(childTemplate)];
    const resolvedParent = resolveTemplate(
      parent,
      templateNameToTemplate,
      attributeResolver,
      parentResolver
    );
    return {
      ...resolvedParent,
      ...attributeResolver(childTemplate),
    };
  }
}

export function resolveColor(
  color: string,
  namedColors: StringDictionary<string>
): string {
  const startingTemplateIndex = color.indexOf("&");
  if (startingTemplateIndex > -1) {
    const lastDelimiterIndex = color.lastIndexOf("&");
    const namedColor = color.substring(
      startingTemplateIndex + 1,
      lastDelimiterIndex
    );
    const namedColorValue = namedColors[namedColor];
    if (!namedColorValue) {
      throw new Error(`Named color: '${namedColor}' is not present!`);
    }

    // todo: check for cyclic references
    if (color === namedColorValue) {
      throw new Error(
        `Very Cheeky, you set ${namedColor} to resolve to itself 😒`
      );
    }

    const resolvedNamedColor = resolveColor(namedColorValue, namedColors);
    if (!resolvedNamedColor) {
      throw new Error(`Cannot find named color '${namedColor}'.`);
    }
    return resolvedNamedColor + color.substring(lastDelimiterIndex + 1) || "";
  }

  return color;
}

function applyNamedColors(
  objectWithNamedColors: StringDictionary<string>,
  namedColors: StringDictionary<string>
): StringDictionary<string> {
  return Object.keys(objectWithNamedColors)
    .map((key) => {
      const color = objectWithNamedColors[key];
      const resolvedColor = resolveColor(color, namedColors);
      return {
        key,
        value: resolvedColor,
      };
    })
    .reduce((accum: StringDictionary<string>, kv) => {
      accum[kv.key] = kv.value;
      return accum;
    }, {});
}

export function constructNamedColorTemplate(
  dokiThemeTemplateJson: MasterDokiThemeDefinition,
  dokiTemplateDefinitions: DokiThemeDefinitions
) {
  const lafTemplates = dokiTemplateDefinitions[NAMED_COLOR_TYPE];
  const lafTemplate = dokiThemeTemplateJson.dark
    ? lafTemplates.dark
    : lafTemplates.light;

  const resolvedColorTemplate = resolveTemplate(
    lafTemplate,
    lafTemplates,
    (template) => template.colors,
    (template) => template.extends
  );

  const resolvedNameColors = resolveNamedColors(
    dokiTemplateDefinitions,
    dokiThemeTemplateJson
  );

  // do not really need to resolve, as there are no
  // &someName& colors, but what ever.
  const resolvedColors = applyNamedColors(
    resolvedColorTemplate,
    resolvedNameColors
  );
  return {
    ...resolvedColors,
    ...resolvedColorTemplate,
    ...resolvedNameColors,
  };
}

function resolveNamedColors(
  dokiTemplateDefinitions: DokiThemeDefinitions,
  dokiThemeTemplateJson: MasterDokiThemeDefinition
) {
  const colorTemplates = dokiTemplateDefinitions[NAMED_COLOR_TYPE];
  return resolveTemplate(
    dokiThemeTemplateJson,
    colorTemplates,
    (template) => template.colors,
    (template) =>
      // @ts-ignore
      template.extends ||
      (template.dark !== undefined &&
        (dokiThemeTemplateJson.dark ? "dark" : "light"))
  );
}

export function getColorFromTemplate(
  templateVariables: StringDictionary<string>,
  templateVariable: string
) {
  const resolvedTemplateVariable = templateVariable
    .split("|")
    .map((namedColor) => templateVariables[namedColor])
    .filter(Boolean)[0];
  if (!resolvedTemplateVariable) {
    throw Error(`Template does not have variable ${templateVariable}`);
  }

  return resolvedTemplateVariable;
}

export const readJson = <T>(jsonPath: string): T =>
  JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

/**internal functions */
type TemplateTypes = StringDictionary<StringDictionary<string>>;

const isTemplate = (filePath: string): boolean => !!getTemplateType(filePath);

export const readTemplates = (templatePaths: string[]): TemplateTypes => {
  return templatePaths
    .filter(isTemplate)
    .map((templatePath) => {
      return {
        type: getTemplateType(templatePath)!!,
        template: readJson<any>(templatePath),
      };
    })
    .reduce(
      (accum: TemplateTypes, templateRepresentation) => {
        accum[templateRepresentation.type][
          templateRepresentation.template.name
        ] = templateRepresentation.template;
        return accum;
      },
      {
        [SYNTAX_TYPE]: {},
        [LAF_TYPE]: {},
        [NAMED_COLOR_TYPE]: {},
      }
    );
};
/**end internal functions */

export function walkDir(dir: string): Promise<string[]> {
  const values: Promise<string[]>[] = fs
    .readdirSync(dir)
    .map((file: string) => {
      const dirPath: string = path.join(dir, file);
      const isDirectory = fs.statSync(dirPath).isDirectory();
      if (isDirectory) {
        return walkDir(dirPath);
      } else {
        return Promise.resolve([path.join(dir, file)]);
      }
    });
  return Promise.all(values).then((scannedDirectories) =>
    scannedDirectories.reduce((accum, files) => accum.concat(files), [])
  );
}

function resolveTemplateVariable(
  templateVariable: string,
  templateVariables: StringDictionary<string>
): string {
  const isToRGB = templateVariable.startsWith("^");
  const cleanTemplateVariable = templateVariable.substr(isToRGB ? 1 : 0);
  const hexColor = resolveColor(
    getColorFromTemplate(templateVariables, cleanTemplateVariable),
    templateVariables
  );
  return hexColor;
}

export function fillInTemplateScript(
  templateToFillIn: string,
  templateVariables: StringDictionary<any>,
  templateVaribaleResolver: (
    templateVariable: string, 
    templateVariables: StringDictionary<string>
    ) => string = resolveTemplateVariable
) {
  return templateToFillIn
    .split("\n")
    .map((line) => {
      const reduce = line.split("").reduce(
        (accum, next) => {
          if (accum.currentTemplate) {
            if (next === "}" && accum.currentTemplate.endsWith("}")) {
              // evaluate Template
              const templateVariable = accum.currentTemplate.substring(
                2,
                accum.currentTemplate.length - 1
              );
              accum.currentTemplate = "";
              const resolvedTemplateVariable = templateVaribaleResolver(
                templateVariable,
                templateVariables
              );
              accum.line += resolvedTemplateVariable;
            } else {
              accum.currentTemplate += next;
            }
          } else if (next === "{" && !accum.stagingTemplate) {
            accum.stagingTemplate = next;
          } else if (accum.stagingTemplate && next === "{") {
            accum.stagingTemplate = "";
            accum.currentTemplate = "{{";
          } else if (accum.stagingTemplate) {
            accum.line += accum.stagingTemplate + next;
            accum.stagingTemplate = "";
          } else {
            accum.line += next;
          }

          return accum;
        },
        {
          currentTemplate: "",
          stagingTemplate: "",
          line: "",
        }
      );
      return reduce.line + reduce.stagingTemplate || reduce.currentTemplate;
    })
    .join("\n");
}

/**
 *
 * @param hex hex string that starts with #
 * @returns string rgba
 */
export function hexToRGBA(hex: string) {
  const hexValue = parseInt(hex.substring(1), 16);
  return (
    "rgba(" +
    [
      (hexValue >> 24) & 255,
      (hexValue >> 16) & 255,
      (hexValue >> 8) & 255,
      hexValue & 255,
    ].join(",") +
    ")"
  );
}

export function toRGBArray(hexColor: string): number[] {
  const hexNumber = parseInt(hexColor.substr(1), 16);
  return [
    (hexNumber & 0xFF0000) >> 16,
    (hexNumber & 0XFF00) >> 8,
    hexNumber & 0xFF
  ]
}
