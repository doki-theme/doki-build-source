import path from "path";
import fs from "fs";
import {
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

export function getGroupName(definition: MasterDokiThemeDefinition) {
  const themeGroup = definition.group;
  const groupMapping = GroupToNameMapping[themeGroup];

  if (!groupMapping) {
    throw new Error(`Unable to find group mapping
        ${themeGroup} for theme ${definition.name}`);
  }

  return groupMapping;
}

export function getDisplayName(dokiTheme: DokiTheme) {
  return `${getGroupName(dokiTheme.definition)}${dokiTheme.definition.name}`;
}

export const getRepoDirectory = (dirname: string) =>
  path.resolve(dirname, "..", "..");

export const LAF_TYPE = "laf";
export const SYNTAX_TYPE = "syntax";
export const NAMED_COLOR_TYPE = "colorz";

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
  [key, value]: [string, T]
) => {
  accum[key] = value;
  return accum;
};

export function resolveStickerPath(
  themeDefinitionPath: string,
  sticker: string,
  currentDirectory: string
) {
  const { appDefinitionDirectoryPath } = resolvePaths(currentDirectory);

  const stickerPath = path.resolve(
    path.resolve(themeDefinitionPath, ".."),
    sticker
  );
  return stickerPath.substr(
    appDefinitionDirectoryPath.length + "/definitions".length
  );
}

export function composeTemplate<T, R>(
  childTemplate: T,
  templateNameToTemplate: StringDictionary<T>,
  attributeResolver: (t: T) => R,
  parentResolver: (t: T) => string[]
): R {
  return composeTemplateWithCombini(
    childTemplate,
    templateNameToTemplate,
    attributeResolver,
    parentResolver,
    (parent, child) => ({
      ...parent,
      ...child
    })
  )
}

export function composeTemplateWithCombini<T, R>(
  childTemplate: T,
  templateNameToTemplate: StringDictionary<T>,
  attributeResolver: (t: T) => R,
  parentResolver: (t: T) => string[] | undefined,
  combiniFunction: (parent: R, child: R) => R,
): R {
  const parentTemplateNames = parentResolver(childTemplate);
  if (!parentTemplateNames) {
    return attributeResolver(childTemplate);
  } else {
    const fullParentTemplates = parentTemplateNames
      .map(parentTemplateName => templateNameToTemplate[parentTemplateName]);

    // combine parents first, so that we 
    // know what will be overidden in the base/grandparent template
    const combinedParents = fullParentTemplates
      .map(parentTemplate => attributeResolver(parentTemplate))
      .reduce((accum, nextTemplate) => combiniFunction(accum, nextTemplate));

    const grandParentsToFillOut = 
    fullParentTemplates.flatMap(
      fullParentTemplate => parentResolver(fullParentTemplate) || []
    );

    if(!grandParentsToFillOut.length) {
      // no grand parents, so these parents are the base
      // of the template, apply the child overrides
      return combiniFunction(
        combinedParents,
        attributeResolver(childTemplate)
      );
    } 

    const resolvedBaseTemplate = Object.keys(
        grandParentsToFillOut.reduce((accum, key)=> ({
          ...accum,
          [key]: key
        }), {})
      )
      .map((grandParentToResolve) => {
        const grandParentTemplate = templateNameToTemplate[grandParentToResolve];
        return composeTemplateWithCombini(
          grandParentTemplate,
          templateNameToTemplate,
          attributeResolver,
          parentResolver,
          combiniFunction,
        );
      })
      .reduce((accum, resolvedTemplate) => combiniFunction(
        accum,
        resolvedTemplate,
      ));

    // apply parent overrides to the base template
    const fullParentTemplate = combiniFunction(
      resolvedBaseTemplate,
      combinedParents,
    );

    // apply child overrides to the parent overrides.
    return combiniFunction(
      fullParentTemplate, 
      attributeResolver(childTemplate),
    );
  }
}

export function resolveTemplate<T, R>(
  childTemplate: T,
  templateNameToTemplate: StringDictionary<T>,
  attributeResolver: (t: T) => R,
  parentResolver: (t: T) => string
): R {
  return resolveTemplateWithCombini(
    childTemplate,
    templateNameToTemplate,
    attributeResolver,
    parentResolver,
    (parent, child) => ({
      ...parent,
      ...child
    })
  )
}

export function resolveTemplateWithCombini<T, R>(
  childTemplate: T,
  templateNameToTemplate: StringDictionary<T>,
  attributeResolver: (t: T) => R,
  parentResolver: (t: T) => string | undefined,
  combiniFunction: (parent: R, child: R) => R,
): R {
  const parentKey = parentResolver(childTemplate);
  if (!parentKey) {
    return attributeResolver(childTemplate);
  } else {
    const parent = templateNameToTemplate[parentKey];
    const resolvedParent = resolveTemplateWithCombini(
      parent,
      templateNameToTemplate,
      attributeResolver,
      parentResolver,
      combiniFunction,
    );
    return combiniFunction(
      resolvedParent,
      attributeResolver(childTemplate),
    )
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

export function applyNamedColors(
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

export function resolveNamedColors(
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

export function toRGBArray(
  hexColor: string | [number, number, number]
): [number, number, number] {
  if (typeof hexColor === "string") {
    const hex = parseInt(hexColor.substr(1), 16);
    return [(hex & 0xff0000) >> 16, (hex & 0xff00) >> 8, hex & 0xff];
  }
  return hexColor;
}

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 *
 * @param   Number  r       The red color value
 * @param   Number  g       The green color value
 * @param   Number  b       The blue color value
 * @return  Array           The HSL representation
 */
export function rgbToHsl([r, g, b]: [number, number, number]) {
  (r /= 255), (g /= 255), (b /= 255);

  var max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  var h,
    s,
    l = (max + min) / 2;

  if (max == min) {
    h = s = 0; // achromatic
  } else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h = h || 0;
    h /= 6;
  }

  return [h, 1, l];
}
