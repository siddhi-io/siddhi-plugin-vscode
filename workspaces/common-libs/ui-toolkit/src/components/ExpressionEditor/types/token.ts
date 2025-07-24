/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { CSSProperties, MutableRefObject, ReactNode } from 'react';
import { ActionButtonType, HelperPaneOrigin } from './common';

export type ResizeHandleProps = {
    editorRef: MutableRefObject<HTMLDivElement | null>;
};

type TokenEditorBaseProps = {
    value: string;
    actionButtons?: ActionButtonType[];
    startAdornment?: ReactNode;
    endAdornment?: ReactNode;
    enableFullscreen?: boolean;
    onChange: (value: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    getExpressionEditorIcon?: () => ReactNode;
    height?: number;
    editorSx?: CSSProperties;
};

type HelperPaneConditionalProps =
    | {
          getHelperPane: (onChange: (value: string) => void, addFunction: (signature: string) => void, height?: number, isFullscreen?: boolean) => JSX.Element;
          helperPaneOrigin?: HelperPaneOrigin;
          changeHelperPaneState: (state: boolean) => void;
          isHelperPaneOpen: boolean;
      }
    | {
          getHelperPane?: never;
          helperPaneOrigin?: never;
          changeHelperPaneState?: never;
          isHelperPaneOpen?: never;
      };

export type TokenEditorProps = TokenEditorBaseProps & HelperPaneConditionalProps;

export type TokenFieldProps = {
    value: string;
    onChange: (value: string) => void;
};
