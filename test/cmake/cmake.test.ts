import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { TestClient } from "./TestClient";
import { TestExtensionContext } from "../stubs";
import { CMakeConfiguration } from "../../src/cmake/config";

suite("CMake Client", () => {
  suite("#updateConfiguration", () => {
    const sourceUri = vscode.Uri.file("/tmp/test-cmake");
    const workspaceFolder = {
      index: 0,
      name: "test-cmake",
      uri: sourceUri
    } as vscode.WorkspaceFolder;
    const context = new TestExtensionContext();
    const client = new TestClient(sourceUri, workspaceFolder, context);
    const regenerateStub = sinon.stub(client, "regenerateBuildDirectory");

    test("replace buildDirectory variables", async () => {
      const testConfig: CMakeConfiguration = {
        name: "Test",
        buildType: "Test",
        buildDirectory: "${env:BUILD_PATH}/project/${buildType}",
        env: {
          BUILD_PATH: "/tmp/build"
        }
      };

      regenerateStub.resolves();

      await client.updateConfiguration(testConfig);
      assert.equal(client.buildDirectory, "/tmp/build/project/Test");
    });

    test("replace env in env", async () => {
      process.env.PATH = "/bin";
      const testConfig: CMakeConfiguration = {
        name: "Test",
        env: { PATH: "${env:PATH}:/usr/bin" }
      };

      regenerateStub.resolves();

      await client.updateConfiguration(testConfig);
      assert.equal(client.environment.PATH, "/bin:/usr/bin");
    });

    test("ignore and correct escaped vars", async () => {
      const testConfig: CMakeConfiguration = {
        name: "Test",
        env: {
          TEST_VAR: "TEST"
        },
        cacheEntries: [
          {
            name: "FOO",
            value: "$${env:TEST_VAR}${env:TEST_VAR}"
          }
        ]
      };

      regenerateStub.resolves();

      await client.updateConfiguration(testConfig);
      assert.deepEqual(client.cacheEntries, [
        {
          name: "FOO",
          value: "${env:TEST_VAR}TEST"
        }
      ]);
    });
  });
});
