export namespace formUrlEncoded {
  export interface FormEncodedOptions {
    sorted?: boolean;
    skipIndex?: boolean;
    ignorenull?: boolean;
    ignoreEmptyArray?: boolean;
    skipBracket?: boolean;
    useDot?: boolean;
    whitespace?: string;
  }
}

export default function formUrlEncoded(
  data: any,
  opts?: formUrlEncoded.FormEncodedOptions,
): string;
