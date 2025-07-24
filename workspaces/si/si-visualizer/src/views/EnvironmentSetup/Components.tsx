/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com).
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import React from 'react';
import styled from "@emotion/styled";
import { Button, Icon, ProgressRing, VSCodeColors } from "@wso2/ui-toolkit";


const Row = styled.div`
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
`;

const SpaceBetweenRow = styled.div`
    display: flex;
    justify-content: space-between;
    width: 100%;
`;

const Column = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
`;

const StepTitle = styled.div<{ color?: string }>`
    font-size: 1.2em;
    font-weight: 400;
    margin-top: 0;
    margin-bottom: 5px;
    color: ${(props: { color?: string }) => props.color || "inherit"};
`;

const StepDescription = styled.div<{ color?: string }>`
    font-size: 1em;
    font-weight: 400;
    margin-top: 0;
    margin-bottom: 1px;
    color: ${(props: { color?: string }) => props.color || "inherit"};
`;

const IconContainer = styled.div`
    margin-top: 4px;
`;
const RUNTIME_CONFIG = {
    JAVA: {
        name: 'Java',
        pathLabel: 'Current Java Home',
    },
    SI: {
        name: 'WSO2 Integrator: SI',
        pathLabel: 'Current SI runtime Path',
    }
};

interface RuntimeStatusProps {
    type: 'JAVA' | 'SI';
    pathDetails: { status: 'valid' | 'valid-not-updated' | 'not-valid'; version?: string; path?: string };
    recommendedVersion: string;
    showInlineDownloadButton: boolean;
    handleDownload: () => void;
    isDownloading: boolean;
    children?: React.ReactNode;
}
interface DownloadComponentProps {
    title: string;
    description: string;
    progress: number;
}
interface ButtonWithDescriptionProps {
    description: string;
    buttonText: string;
    buttonDisabled?: boolean;
    onClick: () => void;
    appearance?: 'primary' | 'secondary' | 'icon';
}
const getIcon = (complete: boolean, loading: boolean, sx?: any) => {
    if (complete) {
        return <Icon name="enable-inverse" iconSx={{ fontSize: "15px", color: VSCodeColors.PRIMARY, ...sx }} />;
    } else if (loading) {
        return <ProgressRing sx={{ height: "16px", width: "16px", ...sx }} color={VSCodeColors.PRIMARY} />;
    } else {
        return <Icon name="radio-button-unchecked" iconSx={{ fontSize: "16px", ...sx }} />;
    }
};
const RuntimeStatus: React.FC<RuntimeStatusProps> = ({
    type,
    pathDetails,
    recommendedVersion,
    showInlineDownloadButton,
    handleDownload,
    isDownloading,
    children,
}) => {
    const config = RUNTIME_CONFIG[type];

    const getStatusContent = () => {
        switch (pathDetails?.status) {
            case 'valid':
                return {
                    isValid: true,
                    title: `${config.name} is setup.`,
                    description: `${config.name} is already setup.`,
                    showDownload: false,
                    showVersion: false,
                };
            case 'valid-not-updated':
                return {
                    isValid: true,
                    title: `${config.name} is setup.`,
                    description: `${config.name} is already setup.`,
                    showDownload: true,
                    showVersion: false,
                };
            case 'not-valid':
                return {
                    isValid: false,
                    title: `${config.name} is not available`,
                    description: `${config.name} version ${recommendedVersion} required to run this project.`,
                    showDownload: true,
                    showVersion: false,
                };
            default:
                return null;
        }
    };
    const content = getStatusContent();
    if (!content) return null;

    const { isValid, title, description, showDownload, showVersion } = content;

    return (
        <SpaceBetweenRow>
            <Row>
                <IconContainer>
                    {getIcon(isValid, false, { cursor: 'default' })}
                </IconContainer>
                <Column>
                    <StepTitle color={isValid && (pathDetails?.status === 'valid' || pathDetails?.status === 'valid-not-updated') ? VSCodeColors.PRIMARY : undefined}>
                        {title}
                    </StepTitle>
                    <StepDescription color={isValid && (pathDetails?.status === 'valid' || pathDetails?.status === 'valid-not-updated') ? VSCodeColors.PRIMARY : undefined}>
                        {description}
                    </StepDescription>
                    {pathDetails?.path && (
                        <StepDescription color={isValid && (pathDetails?.status === 'valid' || pathDetails?.status === 'valid-not-updated') ? VSCodeColors.PRIMARY : undefined}>
                            {config.pathLabel}: {pathDetails.path}
                        </StepDescription>
                    )}
                    {pathDetails.status === 'valid-not-updated' && (
                        <StepDescription color={isValid && pathDetails?.status === 'valid-not-updated' ? VSCodeColors.PRIMARY : undefined}>
                            New update available!
                        </StepDescription>
                    )}
                    {children && (
                        <StepDescription color={isValid && pathDetails?.status === 'valid-not-updated' ? VSCodeColors.PRIMARY : undefined}>
                            {children}
                        </StepDescription>
                    )}
                </Column>
            </Row>
            {showInlineDownloadButton && showDownload && (
                <Button
                    onClick={handleDownload}
                    disabled={isDownloading}
                >
                    {pathDetails?.status === 'valid-not-updated' ? 'Update' : 'Download'} {config.name} {showVersion ?? (recommendedVersion)}
                </Button>
            )}
        </SpaceBetweenRow>
    );
};

const DownloadComponent: React.FC<DownloadComponentProps> = ({ title, description, progress }) => {
    return (
        <Row>
            <IconContainer>
                {getIcon(progress === 100, progress > 0 && progress < 100, { cursor: "default" })}
            </IconContainer>
            <Column>
                <StepTitle>Download {title} {progress ? `( ${progress}% )` : ""}</StepTitle>
                <StepDescription>{description}</StepDescription>
            </Column>
        </Row>
    );
};

const ButtonWithDescription: React.FC<ButtonWithDescriptionProps> = ({ description, buttonText, buttonDisabled = false, onClick, appearance = "primary" }) => (
    <>
        <StepDescription>{description}</StepDescription>
        <Column>
            <Button appearance={appearance} disabled={buttonDisabled} onClick={onClick}>
                {buttonText}
            </Button>
        </Column>
    </>
);
export { RuntimeStatus, DownloadComponent, ButtonWithDescription, Row, Column, StepDescription };