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
// tslint:disable: jsx-no-multiline-js
import React from "react";

import { Codicon } from "../Codicon/Codicon";
import {
    ActionIconWrapper,
    ActionWrapper,
    DeleteIconWrapper,
    EditIconWrapper,
    HeaderLabel,
    ContentWrapper,
    KeyTextWrapper,
    ValueTextWrapper,
    IconWrapper,
    IconTextWrapper,
    Key
} from "./styles";
import { Parameters } from "./ParamManager";
import { Icon } from "../Icon/Icon";

interface ParamItemProps {
    params: Parameters;
    readonly?: boolean;
    onDelete?: (param: Parameters) => void;
    onEditClick?: (param: Parameters) => void;
}

export function ParamItem(props: ParamItemProps) {
    const { params, readonly, onDelete, onEditClick } = props;

    let label = "";
    params.parameters.forEach((param, index) => {
        if (index !== 0) {
            label += param?.value + "   ";
        }
    });
    const handleDelete = () => {
        onDelete(params);
    };
    const handleEdit = () => {
        if (!readonly) {
            onEditClick(params);
        }
    };
    const icon = (typeof params.icon === "string") ? <Icon name={params.icon} /> : params.icon;

    return (
        <HeaderLabel data-testid={`${label}-item`}>
            <ContentWrapper readonly={readonly} onClick={handleEdit}>
                {icon ? (
                    <IconTextWrapper>
                        <IconWrapper> {icon} </IconWrapper>
                        {params.key}
                    </IconTextWrapper>
                ) : (
                    <KeyTextWrapper>
                        <Key> {params.key} </Key>
                    </KeyTextWrapper>
                )}
                <ValueTextWrapper> {params.value} </ValueTextWrapper>
            </ContentWrapper>
            <ActionWrapper>
                {!readonly && (
                    <ActionIconWrapper>
                        <EditIconWrapper>
                            <Codicon name="edit" onClick={handleEdit} />
                        </EditIconWrapper>
                        <DeleteIconWrapper>
                            <Codicon name="trash" onClick={handleDelete} />
                        </DeleteIconWrapper>
                    </ActionIconWrapper>
                )}
            </ActionWrapper>
        </HeaderLabel>
    );
}
