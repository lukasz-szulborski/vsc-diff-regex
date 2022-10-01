type StringToRegexpValid = { regexp: RegExp; isInputBadExpression: false };
type StringToRegexpInvalid = { isInputBadExpression: true };

type StringToRegexp = StringToRegexpInvalid | StringToRegexpValid;

export const stringToRegExp = (
  s?: string | undefined | null
): StringToRegexp => {
  try {
    return {
      isInputBadExpression: false,
      regexp: new RegExp(s ?? ""),
    };
  } catch (error) {
    return {
      isInputBadExpression: true,
    };
  }
};
