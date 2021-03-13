import path from 'path';
import fs from 'fs';
import { DokiThemeDefinitions, MasterDokiThemeDefinition, StringDictonary } from "./types";

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

function resolveTemplate<T, R>(
  childTemplate: T,
  templateNameToTemplate: StringDictonary<T>,
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

function resolveColor(
  color: string,
  namedColors: StringDictonary<string>
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
  objectWithNamedColors: StringDictonary<string>,
  namedColors: StringDictonary<string>
): StringDictonary<string> {
  return Object.keys(objectWithNamedColors)
    .map((key) => {
      const color = objectWithNamedColors[key];
      const resolvedColor = resolveColor(color, namedColors);
      return {
        key,
        value: resolvedColor,
      };
    })
    .reduce((accum: StringDictonary<string>, kv) => {
      accum[kv.key] = kv.value;
      return accum;
    }, {});
}

function constructNamedColorTemplate(
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

function getColorFromTemplate(
  templateVariables: StringDictonary<string>,
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
    templateVariables: StringDictonary<string>
  ): string {
    const isToRGB = templateVariable.startsWith("^");
    const cleanTemplateVariable = templateVariable.substr(isToRGB ? 1 : 0);
    const hexColor = resolveColor(
      getColorFromTemplate(templateVariables, cleanTemplateVariable),
      templateVariables
    );
    return hexColor;
  }

function fillInTemplateScript(
    templateToFillIn: string,
    templateVariables: StringDictonary<any>
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
                            const resolvedTemplateVariable = resolveTemplateVariable(
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
function hexToRGBA(hex: string) {
    const hexValue = parseInt(hex.substring(1), 16);
    return 'rgba(' + [
        (hexValue >> 24) & 255,
        (hexValue >> 16) & 255,
        (hexValue >> 8) & 255,
        hexValue & 255
    ].join(',') + ')';
}