#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const LS_DIR = path.join(PROJECT_ROOT, 'ls');
const GITHUB_REPO_URL = 'https://api.github.com/repos/wso2/si-language-server';

const args = process.argv.slice(2);
const usePrerelease = args.includes('--prerelease') || process.env.isPreRelease === 'true';

const LS_JARS = [
    'io.siddhi.langserver.core',
    'io.siddhi.langserver.launcher',
    'io.siddhi.langserver.runner'
];

function checkExistingJars() {
    try {
        if (!fs.existsSync(LS_DIR)) {
            return false;
        }

        const files = fs.readdirSync(LS_DIR);
        
        const existingJars = LS_JARS.filter(jarName => 
            files.some(file => file.includes(jarName) && file.endsWith('.jar'))
        );

        if (existingJars.length === LS_JARS.length) {
            console.log(`All Siddhi language server JARs already exist in ${path.relative(PROJECT_ROOT, LS_DIR)}`);
            return true;
        }

        if (existingJars.length > 0) {
            console.log(`Found ${existingJars.length}/${LS_JARS.length} Siddhi language server JARs. Re-downloading all...`);
        }

        return false;
    } catch (error) {
        console.error('Error checking existing JAR files:', error.message);
        return false;
    }
}

function httpsRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const authHeader = {};
        if (process.env.WSO2_INTEGRATION_BOT_TOKEN) {
            authHeader['Authorization'] = `Bearer ${process.env.WSO2_INTEGRATION_BOT_TOKEN}`;
        }

        const req = https.request(url, {
            ...options,
            headers: {
                'User-Agent': 'SI-LS-Downloader',
                'Accept': 'application/vnd.github.v3+json',
                ...authHeader,
                ...options.headers
            }
        }, (res) => {
            // Handle HTTP 403 errors specifically
            if (res.statusCode === 403) {
                console.error('HTTP 403: Forbidden. This may be due to GitHub API rate limiting.');
                console.error('Set WSO2_INTEGRATION_BOT_TOKEN environment variable with a personal access token to increase rate limits.');

                // Log rate limit info if available
                if (res.headers['x-ratelimit-limit']) {
                    console.error(`Rate limit: ${res.headers['x-ratelimit-remaining']}/${res.headers['x-ratelimit-limit']}`);
                    console.error(`Rate limit resets at: ${new Date(res.headers['x-ratelimit-reset'] * 1000).toLocaleString()}`);
                }
            }
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ data, statusCode: res.statusCode, headers: res.headers });
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

function downloadFile(url, outputPath, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath);
        let fileErrorOccurred = false;

        // Handle file stream errors
        file.on('error', (err) => {
            fileErrorOccurred = true;
            file.close();
            fs.unlink(outputPath, () => {});
            reject(err);
        });

        const makeRequest = (requestUrl, redirectCount = 0) => {
            const authHeaders = {};
            if (process.env.WSO2_INTEGRATION_BOT_TOKEN) {
                authHeaders['Authorization'] = `Bearer ${process.env.WSO2_INTEGRATION_BOT_TOKEN}`;
            }

            const req = https.request(requestUrl, {
                headers: {
                    'User-Agent': 'SI-LS-Downloader',
                    'Accept': 'application/octet-stream',
                    ...authHeaders
                }
            }, (res) => {
                // Handle redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    if (redirectCount >= maxRedirects) {
                        if (!fileErrorOccurred) {
                            file.close();
                            fs.unlink(outputPath, () => {});
                        }
                        reject(new Error(`Too many redirects (${redirectCount})`));
                        return;
                    }

                    console.log(`Following redirect to: ${res.headers.location}`);
                    makeRequest(res.headers.location, redirectCount + 1);
                    return;
                }

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    // Handle response errors
                    res.on('error', (err) => {
                        if (!fileErrorOccurred) {
                            fileErrorOccurred = true;
                            file.close();
                            fs.unlink(outputPath, () => {});
                            reject(err);
                        }
                    });

                    res.pipe(file);

                    file.on('finish', () => {
                        if (!fileErrorOccurred) {
                            file.close();
                            resolve();
                        }
                    });
                } else {
                    if (!fileErrorOccurred) {
                        file.close();
                        fs.unlink(outputPath, () => {});
                    }
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });

            req.on('error', (err) => {
                if (!fileErrorOccurred) {
                    fileErrorOccurred = true;
                    file.close();
                    fs.unlink(outputPath, () => {});
                    reject(err);
                }
            });

            req.setTimeout(30000, () => {
                req.destroy();
                if (!fileErrorOccurred) {
                    fileErrorOccurred = true;
                    file.close();
                    fs.unlink(outputPath, () => {});
                    reject(new Error('Download timeout'));
                }
            });

            req.end();
        };

        makeRequest(url);
    });
}

function extractZipFile(zipPath, extractDir) {
    try {
        console.log(`Extracting ${path.basename(zipPath)}...`);
        
        if (!fs.existsSync(extractDir)) {
            fs.mkdirSync(extractDir, { recursive: true });
        }

        let unzipCommand;
        if (process.platform === 'win32') {
            try {
                unzipCommand = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`;
                execSync(unzipCommand, { stdio: 'inherit' });
            } catch (error) {
                console.log('PowerShell failed, trying 7zip...');
                unzipCommand = `7z x "${zipPath}" -o"${extractDir}" -y`;
                execSync(unzipCommand, { stdio: 'inherit' });
            }
        } else {
            unzipCommand = `unzip -o "${zipPath}" -d "${extractDir}"`;
            execSync(unzipCommand, { stdio: 'inherit' });
        }

        console.log('✓ Successfully extracted zip file');
        
        // Clean up zip file
        fs.unlinkSync(zipPath);
        
        return true;
    } catch (error) {
        console.error(`✗ Failed to extract zip file: ${error.message}`);
        return false;
    }
}

function findAndMoveJars(extractDir) {
    try {
        const movedJars = [];
        
        // Recursively find all JAR files in the extracted directory
        function findJarFiles(dir) {
            const files = fs.readdirSync(dir);
            const jarFiles = [];
            
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                
                if (stat.isDirectory()) {
                    jarFiles.push(...findJarFiles(filePath));
                } else if (file.endsWith('.jar')) {
                    jarFiles.push(filePath);
                }
            }
            
            return jarFiles;
        }
        
        const allJars = findJarFiles(extractDir);
        console.log(`Found ${allJars.length} JAR files in extracted content`);
        
        // Move relevant JAR files to LS_DIR
        for (const jarPath of allJars) {
            const jarName = path.basename(jarPath);
            const isRelevant = LS_JARS.some(expectedJar => 
                jarName.toLowerCase().includes(expectedJar.toLowerCase()) ||
                jarName.toLowerCase().includes('langserver')
            );
            
            if (isRelevant) {
                const targetPath = path.join(LS_DIR, jarName);
                fs.copyFileSync(jarPath, targetPath);
                
                const fileSize = getFileSize(targetPath);
                const relativePath = path.relative(PROJECT_ROOT, targetPath);
                console.log(`✓ Moved ${jarName} to ${relativePath}`);
                console.log(`  File size: ${fileSize} bytes`);
                movedJars.push(jarName);
            }
        }
        
        // Clean up extracted directory
        fs.rmSync(extractDir, { recursive: true, force: true });
        
        return movedJars;
    } catch (error) {
        console.error(`Error processing JAR files: ${error.message}`);
        return [];
    }
}

function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.size;
    } catch (error) {
        return 'unknown';
    }
}

async function getLatestRelease(usePrerelease) {
    if (usePrerelease) {
        // Get all releases and find the latest prerelease
        const releasesResponse = await httpsRequest(`${GITHUB_REPO_URL}/releases`);
        let releases;
        try {
            releases = JSON.parse(releasesResponse.data);
        } catch (error) {
            throw new Error('Failed to parse releases information JSON');
        }
        // Sort releases by published_at date in descending order and find the latest prerelease
        const prerelease = releases
            .filter(release => release.prerelease)
            .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))[0];

        if (!prerelease) {
            throw new Error('No prerelease found');
        }
        return prerelease;
    } else {
        // Get the latest stable release
        const releaseResponse = await httpsRequest(`${GITHUB_REPO_URL}/releases/latest`);
        try {
            return JSON.parse(releaseResponse.data);
        } catch (error) {
            throw new Error('Failed to parse release information JSON');
        }
    }
}

async function downloadAndExtractLanguageServer(releaseData) {
    try {
        const zipAsset = releaseData.assets?.find(asset => 
            asset.name.toLowerCase().endsWith('.zip') && 
            asset.name.toLowerCase().includes('language-server')
        );

        if (!zipAsset) {
            console.error('Error: Could not find language server zip file in release assets');
            console.log('Available assets:');
            releaseData.assets?.forEach(asset => console.log(`  - ${asset.name}`));
            return [];
        }

        console.log(`Found language server zip: ${zipAsset.name}`);
        
        const zipPath = path.join(LS_DIR, zipAsset.name);
        const extractDir = path.join(LS_DIR, 'temp_extract');
        const downloadUrl = `${GITHUB_REPO_URL}/releases/assets/${zipAsset.id}`;

        // Download zip file
        console.log(`Downloading ${zipAsset.name}...`);
        await downloadFile(downloadUrl, zipPath);

        if (!fs.existsSync(zipPath) || getFileSize(zipPath) === 0) {
            throw new Error('Downloaded zip file is empty or does not exist');
        }

        console.log(`✓ Successfully downloaded ${zipAsset.name}`);
        console.log(`  File size: ${getFileSize(zipPath)} bytes`);

        // Extract zip file
        if (!extractZipFile(zipPath, extractDir)) {
            throw new Error('Failed to extract zip file');
        }

        // Find and move JAR files
        const movedJars = findAndMoveJars(extractDir);
        
        return movedJars;
        
    } catch (error) {
        console.error(`✗ Failed to download and extract language server: ${error.message}`);
        return [];
    }
}

async function main() {
    try {
        if (checkExistingJars()) {
            process.exit(0);
        }

        console.log(`Downloading WSO2 Integrator: SI language server${usePrerelease ? ' (prerelease)' : ''}...`);

        if (!fs.existsSync(LS_DIR)) {
            fs.mkdirSync(LS_DIR, { recursive: true });
        }

        console.log('Fetching release information...');
        const releaseData = await getLatestRelease(usePrerelease);

        console.log(`Found release: ${releaseData.name || releaseData.tag_name}`);
        console.log(`Release date: ${releaseData.published_at}`);
        console.log(`Available assets: ${releaseData.assets?.length || 0}`);

        if (!releaseData.assets || releaseData.assets.length === 0) {
            console.error('Error: No assets found in the release');
            process.exit(1);
        }

        const downloadedJars = await downloadAndExtractLanguageServer(releaseData);

        if (downloadedJars.length === 0) {
            console.error('Error: No Siddhi language server JARs were downloaded');
            process.exit(1);
        }

        console.log(`\n✓ Successfully downloaded and extracted ${downloadedJars.length} Siddhi language server JARs:`);
        downloadedJars.forEach(jar => console.log(`  - ${jar}`));

        if (downloadedJars.length < LS_JARS.length) {
            console.log(`\n⚠ Warning: Found ${downloadedJars.length} JAR files, expected ${LS_JARS.length}`);
            console.log('This may be normal if the JAR structure has changed.');
        }

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main, checkExistingJars };
