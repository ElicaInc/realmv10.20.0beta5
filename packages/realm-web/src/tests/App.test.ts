////////////////////////////////////////////////////////////////////////////
//
// Copyright 2020 Realm Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
////////////////////////////////////////////////////////////////////////////

import { expect } from "chai";

import { App, User, UserState, Credentials, MongoDBRealmError } from "..";
import { MemoryStorage } from "../storage";

import {
  ACCEPT_JSON_HEADERS,
  SENDING_JSON_HEADERS,
  LOCATION_RESPONSE,
  LOCATION_REQUEST,
  DEFAULT_AUTH_OPTIONS,
  INVALID_SESSION_ERROR,
  MockApp,
  MockNetworkTransport,
} from "./utils";

describe("App", () => {
  it("can call the App as a constructor", () => {
    const app = new App("default-app-id");
    expect(app).to.be.instanceOf(App);
  });

  describe("static getApp function", () => {
    it("return the same App instance only if ids match", () => {
      const app1 = App.getApp("default-app-id");
      expect(app1).to.be.instanceOf(App);
      const app2 = App.getApp("default-app-id");
      expect(app2).equals(app1);
      const app3 = App.getApp("another-app-id");
      expect(app2).to.not.equal(app3);
    });
  });

  it("can call the App as a constructor with options", () => {
    const app = new App({
      id: "default-app-id",
      baseUrl: "http://localhost:3000",
    });
    expect(app).to.be.instanceOf(App);
  });

  it("throws if no id is provided", () => {
    expect(() => {
      new (App as any)();
    }).to.throw("Missing a MongoDB Realm app-id");
  });

  it("throws if an object is provided instead of an id", () => {
    expect(() => {
      new (App as any)({});
    }).to.throw("Missing a MongoDB Realm app-id");
  });

  it("expose the id", () => {
    const app = new App("default-app-id");
    expect(app.id).equals("default-app-id");
  });

  it("expose a static Credentials factory", () => {
    expect(typeof App.Credentials).not.equals("undefined");
    expect(typeof App.Credentials.anonymous).equals("function");
    expect(typeof App.Credentials.userApiKey).equals("function");
    expect(typeof App.Credentials.serverApiKey).equals("function");
    expect(typeof App.Credentials.apiKey).equals("function");
    expect(typeof App.Credentials.emailPassword).equals("function");
  });

  it("fetches the location first", async () => {
    const transport = new MockNetworkTransport([
      LOCATION_RESPONSE,
      {
        user_id: "totally-valid-user-id",
        access_token: "deadbeef",
        refresh_token: "very-refreshing",
        device_id: "000000000000000000000000",
      },
    ]);
    const app = new App({
      id: "my-mocked-app",
      storage: new MemoryStorage(),
      transport,
      baseUrl: "http://localhost:1234",
    });
    const credentials = Credentials.anonymous();
    await app.logIn(credentials, false);
    // Expect the request made it to the transport
    expect(transport.requests).deep.equals([
      LOCATION_REQUEST,
      {
        method: "POST",
        url: `http://localhost:1337/api/client/v2.0/app/my-mocked-app/auth/providers/anon-user/login`,
        body: {
          options: DEFAULT_AUTH_OPTIONS,
        },
        headers: SENDING_JSON_HEADERS,
      },
    ]);
  });

  it("skips fetching the location if asked to", async () => {
    const transport = new MockNetworkTransport([
      {
        user_id: "totally-valid-user-id",
        access_token: "deadbeef",
        refresh_token: "very-refreshing",
        device_id: "000000000000000000000000",
      },
    ]);
    const app = new App({
      id: "my-mocked-app",
      storage: new MemoryStorage(),
      transport,
      baseUrl: "http://localhost:1234",
      skipLocationRequest: true,
    });
    const credentials = Credentials.anonymous();
    await app.logIn(credentials, false);
    // Expect only a single request made via the transport
    expect(transport.requests).deep.equals([
      {
        method: "POST",
        url: `http://localhost:1234/api/client/v2.0/app/my-mocked-app/auth/providers/anon-user/login`,
        body: {
          options: DEFAULT_AUTH_OPTIONS,
        },
        headers: SENDING_JSON_HEADERS,
      },
    ]);
  });

  it("can log in a user", async () => {
    const storage = new MemoryStorage();
    const transport = new MockNetworkTransport([
      { hostname: "http://localhost:1337" },
      {
        user_id: "totally-valid-user-id",
        access_token: "deadbeef",
        refresh_token: "very-refreshing",
        device_id: "000000000000000000000000",
      },
      {
        data: {
          first_name: "John",
          last_name: "Doe",
        },
        domain_id: "5ed10debc085000e2c0097ac",
        identities: [
          {
            id: "5ed10e0dc085000e2c0099f2-fufttusvpmojykvacvhijoaq",
            provider_id: "5ed10dedc085000e2c0097c5",
            provider_type: "anon-user",
          },
        ],
        type: "normal",
        user_id: "5ed10e0dc085000e2c0099f3",
      },
    ]);
    const app = new App({
      id: "my-mocked-app",
      storage,
      transport,
      baseUrl: "http://localhost:1234",
    });
    const credentials = Credentials.emailPassword("gilfoyle@testing.mongodb.com", "v3ry-s3cret");
    const user = await app.logIn(credentials);
    // Expect logging in returns a user
    expect(user).is.instanceOf(User);
    // Expect the user has an id
    expect(user.id).equals("totally-valid-user-id");
    // Expect the user has an access token
    expect(user.accessToken).equal("deadbeef");
    // Expect the user is logged in (active)
    expect(user.state).equals("active");
    expect(user.state).equals(UserState.Active);
    expect(user.isLoggedIn).equals(true);
    // Expect the request made it to the transport
    expect(transport.requests).deep.equals([
      LOCATION_REQUEST,
      {
        method: "POST",
        url: `http://localhost:1337/api/client/v2.0/app/my-mocked-app/auth/providers/local-userpass/login`,
        body: {
          username: "gilfoyle@testing.mongodb.com",
          password: "v3ry-s3cret",
          options: DEFAULT_AUTH_OPTIONS,
        },
        headers: SENDING_JSON_HEADERS,
      },
      {
        method: "GET",
        url: "http://localhost:1337/api/client/v2.0/auth/profile",
        headers: {
          Authorization: "Bearer deadbeef",
          ...ACCEPT_JSON_HEADERS,
        },
      },
    ]);
  });

  it("can log out a user", async () => {
    const storage = new MemoryStorage();
    const transport = new MockNetworkTransport([
      { hostname: "http://localhost:1337" },
      {
        user_id: "totally-valid-user-id",
        access_token: "deadbeef",
        refresh_token: "very-refreshing",
        device_id: "000000000000000000000000",
      },
      {},
    ]);
    const app = new App({
      id: "my-mocked-app",
      transport,
      storage,
      baseUrl: "http://localhost:1234",
    });
    const credentials = Credentials.anonymous();
    const user = await app.logIn(credentials, false);
    // Expect that we logged in
    expect(app.currentUser).equals(user);
    expect(app.allUsers).deep.equals({ [user.id]: user });
    expect(user.isLoggedIn).equals(true);

    await user.logOut();
    // Expect that we logged out
    expect(app.currentUser).equals(null);
    expect(user.state).equals(UserState.LoggedOut);
    expect(user.state).equals("logged-out");
    expect(user.isLoggedIn).equals(false);
    expect(app.allUsers).deep.equals({ [user.id]: user });
    // Assume the correct requests made it to the transport
    expect(transport.requests).deep.equals([
      LOCATION_REQUEST,
      {
        method: "POST",
        url: `http://localhost:1337/api/client/v2.0/app/my-mocked-app/auth/providers/anon-user/login`,
        body: {
          options: DEFAULT_AUTH_OPTIONS,
        },
        headers: SENDING_JSON_HEADERS,
      },
      {
        method: "DELETE",
        url: "http://localhost:1337/api/client/v2.0/auth/session",
        headers: {
          Authorization: "Bearer very-refreshing",
          ...ACCEPT_JSON_HEADERS,
        },
      },
    ]);
  });

  it("can log in a user, when another user is already logged in", async () => {
    const transport = new MockNetworkTransport([
      { hostname: "http://localhost:1337" },
      {
        user_id: "totally-valid-user-id-1",
        access_token: "deadbeef1",
        refresh_token: "very-refreshing-1",
        device_id: "000000000000000000000000",
      },
      {
        data: {},
        domain_id: "5ed10debc085000e2c0097ac",
        identities: [],
        type: "normal",
        user_id: "totally-valid-user-id-1",
      },
      {
        user_id: "totally-valid-user-id-2",
        access_token: "deadbeef2",
        refresh_token: "very-refreshing-2",
        device_id: "000000000000000000000000",
      },
      {
        data: {},
        domain_id: "5ed10debc085000e2c0097ac",
        identities: [],
        type: "normal",
        user_id: "totally-valid-user-id-2",
      },
    ]);
    const app = new App({
      id: "my-mocked-app",
      transport,
      baseUrl: "http://localhost:1234",
    });
    // Log in two different users
    {
      const credentials = Credentials.emailPassword("gilfoyle@testing.mongodb.com", "v3ry-s3cret-1");
      await app.logIn(credentials);
    }
    {
      const credentials = Credentials.emailPassword("dinesh@testing.mongodb.com", "v3ry-s3cret-2");
      await app.logIn(credentials);
    }
    // Expect the request made it to the transport
    expect(transport.requests).deep.equals([
      LOCATION_REQUEST,
      {
        method: "POST",
        url: `http://localhost:1337/api/client/v2.0/app/my-mocked-app/auth/providers/local-userpass/login`,
        body: {
          username: "gilfoyle@testing.mongodb.com",
          password: "v3ry-s3cret-1",
          options: DEFAULT_AUTH_OPTIONS,
        },
        headers: SENDING_JSON_HEADERS,
      },
      {
        method: "GET",
        url: "http://localhost:1337/api/client/v2.0/auth/profile",
        headers: {
          Authorization: "Bearer deadbeef1",
          ...ACCEPT_JSON_HEADERS,
        },
      },
      {
        method: "POST",
        url: `http://localhost:1337/api/client/v2.0/app/my-mocked-app/auth/providers/local-userpass/login`,
        body: {
          username: "dinesh@testing.mongodb.com",
          password: "v3ry-s3cret-2",
          options: DEFAULT_AUTH_OPTIONS,
        },
        headers: SENDING_JSON_HEADERS,
      },
      {
        method: "GET",
        url: "http://localhost:1337/api/client/v2.0/auth/profile",
        headers: {
          Authorization: "Bearer deadbeef2",
          ...ACCEPT_JSON_HEADERS,
        },
      },
    ]);
  });

  it("can delete a user", async () => {
    const storage = new MemoryStorage();
    const transport = new MockNetworkTransport([
      { hostname: "http://localhost:1337" },
      {
        user_id: "totally-valid-user-id",
        access_token: "deadbeef",
        refresh_token: "very-refreshing",
        device_id: "000000000000000000000000",
      },
      {
        data: {
          first_name: "John",
          last_name: "Doe",
        },
        domain_id: "5ed10debc085000e2c0097ac",
        identities: [
          {
            id: "5ed10e0dc085000e2c0099f2-fufttusvpmojykvacvhijoaq",
            provider_id: "5ed10dedc085000e2c0097c5",
            provider_type: "anon-user",
          },
        ],
        type: "normal",
        user_id: "5ed10e0dc085000e2c0099f3",
      },
      {}, // Delete user
      {}, // Delete session (while logging out)
    ]);
    // Create an app and authenticate
    const app = new App({
      id: "my-mocked-app",
      storage,
      transport,
      baseUrl: "http://localhost:1234",
    });
    const credentials = Credentials.emailPassword("gilfoyle@testing.mongodb.com", "v3ry-s3cret");
    const user = await app.logIn(credentials);

    // Expect login returns a user
    expect(user).is.instanceOf(User);
    expect(user.isLoggedIn).equals(true);
    // Delete the user
    await app.deleteUser(user);
    // The user is logged out
    expect(user.isLoggedIn).equals(false);
  });

  it("can remove an active user", async () => {
    const storage = new MemoryStorage();
    const transport = new MockNetworkTransport([
      { hostname: "http://localhost:1337" },
      {
        user_id: "totally-valid-user-id",
        access_token: "deadbeef",
        refresh_token: "very-refreshing",
        device_id: "000000000000000000000000",
      },
      {},
    ]);
    const app = new App({
      id: "my-mocked-app",
      storage,
      transport,
      baseUrl: "http://localhost:1234",
    });
    const credentials = Credentials.anonymous();
    const user = await app.logIn(credentials, false);
    // Expect that we logged in
    expect(app.currentUser).equals(user);
    expect(app.allUsers).deep.equals({ [user.id]: user });
    await app.removeUser(user);
    expect(app.currentUser).equals(null);
    expect(user.state).equals(UserState.Removed);
    expect(user.state).equals("removed");
    expect(app.allUsers).deep.equals({});
    // Assume the correct requests made it to the transport
    expect(transport.requests).deep.equals([
      LOCATION_REQUEST,
      {
        method: "POST",
        url: `http://localhost:1337/api/client/v2.0/app/my-mocked-app/auth/providers/anon-user/login`,
        body: {
          options: DEFAULT_AUTH_OPTIONS,
        },
        headers: SENDING_JSON_HEADERS,
      },
      {
        method: "DELETE",
        url: "http://localhost:1337/api/client/v2.0/auth/session",
        headers: {
          Authorization: "Bearer very-refreshing",
          ...ACCEPT_JSON_HEADERS,
        },
      },
    ]);
  });

  it("throws if asked to switch to or remove an unknown user", async () => {
    const storage = new MemoryStorage();
    const transport = new MockNetworkTransport([
      { hostname: "http://localhost:1337" },
      {
        user_id: "totally-valid-user-id",
        access_token: "deadbeef",
        refresh_token: "very-refreshing",
        device_id: "000000000000000000000000",
      },
    ]);
    const app = new App({
      id: "my-mocked-app",
      storage,
      transport,
      baseUrl: "http://localhost:1234",
    });
    const credentials = Credentials.anonymous();
    const user = await app.logIn(credentials, false);
    // Expect that we logged in
    expect(app.currentUser).equals(user);
    expect(app.allUsers).deep.equals({ [user.id]: user });
    const anotherUser = {} as User;
    // Switch
    try {
      await app.switchUser(anotherUser);
      throw new Error("Expected an exception");
    } catch (err) {
      if (err instanceof Error) {
        expect(err.message).equals("The user was never logged into this app");
      } else {
        throw err;
      }
    }
    // Remove
    try {
      await app.removeUser(anotherUser);
      throw new Error("Expected an exception");
    } catch (err) {
      if (err instanceof Error) {
        expect(err.message).equals("The user was never logged into this app");
      } else {
        throw err;
      }
    }
    // Expect the first user to remain logged in and known to the app
    expect(app.currentUser).equals(user);
    expect(app.allUsers).deep.equals({ [user.id]: user });
    expect(user.state).equals("active");
    // Assume the correct requests made it to the transport
    expect(transport.requests).deep.equals([
      LOCATION_REQUEST,
      {
        method: "POST",
        url: `http://localhost:1337/api/client/v2.0/app/my-mocked-app/auth/providers/anon-user/login`,
        body: {
          options: DEFAULT_AUTH_OPTIONS,
        },
        headers: SENDING_JSON_HEADERS,
      },
    ]);
  });

  it("refresh access token upon an 'invalid session' (401) response", async () => {
    const app = new MockApp("my-mocked-app", [
      LOCATION_RESPONSE,
      {
        user_id: "bobs-id",
        access_token: "first-access-token",
        refresh_token: "very-refreshing",
        device_id: "000000000000000000000000",
      },
      INVALID_SESSION_ERROR,
      {
        user_id: "bobs-id",
        access_token: "second-access-token",
        refresh_token: "very-refreshing",
        device_id: "000000000000000000000000",
      },
      { bar: "baz" },
    ]);
    // Login with an anonymous user
    const credentials = Credentials.anonymous();
    const user = await app.logIn(credentials, false);
    // Expect the tokens to be remembered
    expect(user.accessToken).not.equals(null);
    expect(user.refreshToken).not.equals(null);
    // Manually try again - this time refreshing the access token correctly
    const response = await user.functions.foo({ bar: "baz" });
    expect(response).deep.equals({ bar: "baz" });
    // Expect something of the request and response
    expect(app.requests).deep.equals([
      LOCATION_REQUEST,
      {
        method: "POST",
        url: `http://localhost:1337/api/client/v2.0/app/my-mocked-app/auth/providers/anon-user/login`,
        body: {
          options: DEFAULT_AUTH_OPTIONS,
        },
        headers: SENDING_JSON_HEADERS,
      },
      {
        method: "POST",
        url: "http://localhost:1337/api/client/v2.0/app/my-mocked-app/functions/call",
        body: { name: "foo", arguments: [{ bar: "baz" }] },
        headers: {
          ...SENDING_JSON_HEADERS,
          Authorization: "Bearer first-access-token",
        },
      },
      {
        method: "POST",
        url: "http://localhost:1337/api/client/v2.0/auth/session",
        headers: {
          ...ACCEPT_JSON_HEADERS,
          Authorization: "Bearer very-refreshing",
        },
      },
      {
        method: "POST",
        url: "http://localhost:1337/api/client/v2.0/app/my-mocked-app/functions/call",
        body: { name: "foo", arguments: [{ bar: "baz" }] },
        headers: {
          ...SENDING_JSON_HEADERS,
          Authorization: "Bearer second-access-token",
        },
      },
    ]);
  });

  it("attempts to refresh access token, retries request exacly once, upon an 'invalid session' (401) response", async () => {
    const app = new MockApp("my-mocked-app", [
      LOCATION_RESPONSE,
      {
        user_id: "bobs-id",
        access_token: "first-access-token",
        refresh_token: "very-refreshing",
        device_id: "000000000000000000000000",
      },
      INVALID_SESSION_ERROR,
      INVALID_SESSION_ERROR,
    ]);
    // Login with an anonymous user
    const credentials = Credentials.anonymous();
    const user = await app.logIn(credentials, false);
    // Send a request (which will fail)
    try {
      await user.functions.foo({ bar: "baz" });
      throw new Error("Expected the request to fail");
    } catch (err) {
      expect(err).instanceOf(MongoDBRealmError);
      if (err instanceof MongoDBRealmError) {
        expect(err.message).equals(
          "Request failed (POST http://localhost:1337/api/client/v2.0/auth/session): invalid session (status 401)",
        );
      }
    }
    // Expect the tokens to be forgotten
    expect(user.accessToken).equals(null);
    expect(user.refreshToken).equals(null);
    // Expect something of the request and response
    expect(app.requests).deep.equals([
      LOCATION_REQUEST,
      {
        method: "POST",
        url: `http://localhost:1337/api/client/v2.0/app/my-mocked-app/auth/providers/anon-user/login`,
        body: {
          options: DEFAULT_AUTH_OPTIONS,
        },
        headers: SENDING_JSON_HEADERS,
      },
      {
        method: "POST",
        url: "http://localhost:1337/api/client/v2.0/app/my-mocked-app/functions/call",
        body: { name: "foo", arguments: [{ bar: "baz" }] },
        headers: {
          ...SENDING_JSON_HEADERS,
          Authorization: "Bearer first-access-token",
        },
      },
      {
        method: "POST",
        url: "http://localhost:1337/api/client/v2.0/auth/session",
        headers: {
          ...ACCEPT_JSON_HEADERS,
          Authorization: "Bearer very-refreshing",
        },
      },
    ]);
  });

  it("expose a callable functions factory", async () => {
    const storage = new MemoryStorage();
    const transport = new MockNetworkTransport([
      { hostname: "http://localhost:1337" },
      {
        user_id: "totally-valid-user-id",
        access_token: "deadbeef",
        refresh_token: "very-refreshing",
        device_id: "000000000000000000000000",
      },
      { msg: "hi there!" },
    ]);
    const app = new App({
      id: "my-mocked-app",
      storage,
      transport,
      baseUrl: "http://localhost:1234",
    });
    const credentials = Credentials.anonymous();
    const user = await app.logIn(credentials, false);
    // Call the function
    const response = await user.functions.hello();
    expect(response).to.deep.equal({ msg: "hi there!" });
    expect(transport.requests).to.deep.equal([
      LOCATION_REQUEST,
      {
        method: "POST",
        url: `http://localhost:1337/api/client/v2.0/app/my-mocked-app/auth/providers/anon-user/login`,
        body: {
          options: DEFAULT_AUTH_OPTIONS,
        },
        headers: SENDING_JSON_HEADERS,
      },
      {
        method: "POST",
        url: "http://localhost:1337/api/client/v2.0/app/my-mocked-app/functions/call",
        body: { name: "hello", arguments: [] },
        headers: {
          Authorization: "Bearer deadbeef",
          ...SENDING_JSON_HEADERS,
        },
      },
    ]);
  });

  it("hydrates users from storage", () => {
    const storage = new MemoryStorage();
    const transport = new MockNetworkTransport([]);

    // Fill data into the storage that can be hydrated
    const appStorage = storage.prefix("app(my-mocked-app)");
    appStorage.set("userIds", JSON.stringify(["alices-id", "bobs-id"]));

    const alicesStorage = appStorage.prefix("user(alices-id)");
    alicesStorage.set("accessToken", "alices-access-token");
    alicesStorage.set("refreshToken", "alices-refresh-token");
    alicesStorage.set("providerType", "anon-user");
    alicesStorage.set(
      "profile",
      JSON.stringify({
        type: "normal",
        identities: [],
        data: {
          firstName: "Alice",
        },
      }),
    );

    const bobsStorage = appStorage.prefix("user(bobs-id)");
    bobsStorage.set("accessToken", "bobs-access-token");
    bobsStorage.set("refreshToken", "bobs-refresh-token");
    bobsStorage.set("providerType", "anon-user");

    const app = new App({
      id: "my-mocked-app",
      storage,
      transport,
      baseUrl: "http://localhost:1337",
    });

    expect(Object.keys(app.allUsers).length).equals(2);

    const alice = app.allUsers["alices-id"];
    expect(alice.id).equals("alices-id");
    expect(alice.accessToken).equals("alices-access-token");
    expect(alice.refreshToken).equals("alices-refresh-token");
    expect(alice.providerType).equals("anon-user");
    expect(alice.profile.firstName).equals("Alice");

    const bob = app.allUsers["bobs-id"];
    expect(bob.id).equals("bobs-id");
    expect(bob.accessToken).equals("bobs-access-token");
    expect(bob.refreshToken).equals("bobs-refresh-token");
    expect(bob.providerType).equals("anon-user");
  });

  it("saves users to storage when logging in", async () => {
    const storage = new MemoryStorage();
    const transport = new MockNetworkTransport([
      { hostname: "http://localhost:1337" },
      {
        user_id: "totally-valid-user-id",
        access_token: "deadbeef",
        refresh_token: "very-refreshing",
        device_id: "000000000000000000000000",
      },
    ]);
    const app = new App({
      id: "my-mocked-app",
      storage,
      transport,
      baseUrl: "http://localhost:1234",
    });

    const credentials = App.Credentials.anonymous();
    const user = await app.logIn(credentials, false);

    expect(user.id).equals("totally-valid-user-id");
    const appStorage = storage.prefix("app(my-mocked-app)");
    expect(appStorage.get("userIds")).equals(JSON.stringify(["totally-valid-user-id"]));
    const userStorage = appStorage.prefix("user(totally-valid-user-id)");
    expect(userStorage.get("accessToken")).equals("deadbeef");
    expect(userStorage.get("refreshToken")).equals("very-refreshing");
  });

  it("merges logins and logouts of multiple apps with the same storage", async () => {
    const storage = new MemoryStorage();

    const app1 = new App({
      id: "my-mocked-app",
      storage,
      transport: new MockNetworkTransport([
        LOCATION_RESPONSE,
        {
          user_id: "alices-id",
          access_token: "alices-access-token",
          refresh_token: "alices-refresh-token",
          device_id: "000000000000000000000000",
        },
        {
          user_id: "bobs-id",
          access_token: "bobs-access-token",
          refresh_token: "bobs-refresh-token",
          device_id: "000000000000000000000000",
        },
        {
          data: {
            first_name: "Bobby",
          },
          identities: [],
          type: "normal",
        },
        {},
      ]),
      baseUrl: "http://localhost:1337",
    });

    const app2 = new App({
      id: "my-mocked-app",
      storage,
      transport: new MockNetworkTransport([
        LOCATION_RESPONSE,
        {
          user_id: "charlies-id",
          access_token: "charlies-access-token",
          refresh_token: "charlies-refresh-token",
          device_id: "000000000000000000000000",
        },
      ]),
      baseUrl: "http://localhost:1337",
    });

    const credentials = App.Credentials.anonymous();
    await app1.logIn(credentials, false); // Alice
    await app2.logIn(credentials, false); // Charlie
    const bob = await app1.logIn(credentials, true);

    const appStorage = storage.prefix("app(my-mocked-app)");
    expect(appStorage.get("userIds")).equals(
      // We expect Charlies id to be last, because the last login was in app1
      // We expect bobs-id to be first because he was the last login
      JSON.stringify(["bobs-id", "alices-id", "charlies-id"]),
    );

    // Logging out bob, we expect:
    // - The tokens to be removed from storage
    // - The profile to remain in storage
    // - The id to remain in the list of ids
    const bobsStorage = appStorage.prefix("user(bobs-id)");
    expect(bobsStorage.get("accessToken")).equals("bobs-access-token");
    expect(bobsStorage.get("refreshToken")).equals("bobs-refresh-token");
    const bobsProfileBefore = JSON.parse(bobsStorage.get("profile") || "");
    expect(bobsProfileBefore).deep.equals({
      type: "normal",
      identities: [],
      data: {
        firstName: "Bobby",
      },
    });

    await bob.logOut();
    expect(bobsStorage.get("accessToken")).equals(null);
    expect(bobsStorage.get("refreshToken")).equals(null);
    const bobsProfileAfter = JSON.parse(bobsStorage.get("profile") || "");
    expect(bobsProfileAfter).deep.equals(bobsProfileBefore);
    expect(appStorage.get("userIds")).equals(JSON.stringify(["bobs-id", "alices-id", "charlies-id"]));

    // Removing Bob from the app, removes his profile and id from the app's storage
    await app1.removeUser(bob);
    expect(bobsStorage.get("profile")).equals(null);
    expect(appStorage.get("userIds")).equals(JSON.stringify(["alices-id", "charlies-id"]));
  });

  it("returns the same user when logged in twice", async () => {
    const storage = new MemoryStorage();
    const app = new App({
      id: "my-mocked-app",
      storage,
      transport: new MockNetworkTransport([
        LOCATION_RESPONSE,
        {
          user_id: "gilfoyles-id",
          access_token: "gilfoyles-first-access-token",
          refresh_token: "gilfoyles-first-refresh-token",
          device_id: "000000000000000000000000",
        },
        {
          user_id: "dineshs-id",
          access_token: "dineshs-first-access-token",
          refresh_token: "dineshs-first-refresh-token",
          device_id: "000000000000000000000000",
        },
        {
          user_id: "gilfoyles-id",
          access_token: "gilfoyles-second-access-token",
          refresh_token: "gilfoyles-second-refresh-token",
          device_id: "000000000000000000000000",
        },
        {},
        {
          user_id: "gilfoyles-id",
          access_token: "gilfoyles-third-access-token",
          refresh_token: "gilfoyles-third-refresh-token",
          device_id: "000000000000000000000000",
        },
        {},
        {
          user_id: "gilfoyles-id",
          access_token: "gilfoyles-forth-access-token",
          refresh_token: "gilfoyles-forth-refresh-token",
          device_id: "000000000000000000000000",
        },
      ]),
      baseUrl: "http://localhost:1337",
    });
    // Login twice with the same user
    const credentials1 = Credentials.emailPassword("gilfoyle@testing.mongodb.com", "v3ry-s3cret");
    const credentials2 = Credentials.emailPassword("dinesh@testing.mongodb.com", "v3ry-s3cret-2");
    const gilfoyle1 = await app.logIn(credentials1, false);
    expect(app.allUsers).deep.equals({ [gilfoyle1.id]: gilfoyle1 });
    const dinesh = await app.logIn(credentials2, false);
    const gilfoyle2 = await app.logIn(credentials1, false);
    // Expect all users to equal the user being returned on either login
    expect(app.allUsers).deep.equals({
      [gilfoyle1.id]: gilfoyle1,
      [dinesh.id]: dinesh,
    });
    expect(app.allUsers).deep.equals({
      [gilfoyle2.id]: gilfoyle2,
      [dinesh.id]: dinesh,
    });
    // Expect that the current user has the tokens from the second login
    {
      const { currentUser } = app;
      const { accessToken, refreshToken } = currentUser || {};
      expect(accessToken).equals("gilfoyles-second-access-token");
      expect(refreshToken).equals("gilfoyles-second-refresh-token");
      expect(storage.get("app(my-mocked-app):user(gilfoyles-id):accessToken")).equals("gilfoyles-second-access-token");
    }
    // Logout and back in and expect the same
    await gilfoyle2.logOut();
    // Expect that the current user is null
    {
      const { currentUser } = app;
      expect(currentUser).equals(dinesh);
    }
    const gilfoyle3 = await app.logIn(credentials1, false);
    expect(app.allUsers).deep.equals({
      [gilfoyle2.id]: gilfoyle2,
      [dinesh.id]: dinesh,
    });
    expect(app.allUsers).deep.equals({
      [gilfoyle3.id]: gilfoyle3,
      [dinesh.id]: dinesh,
    });
    // Expect that the current user has the tokens from the third login
    {
      const { currentUser } = app;
      const { accessToken, refreshToken } = currentUser || {};
      expect(accessToken).equals("gilfoyles-third-access-token");
      expect(refreshToken).equals("gilfoyles-third-refresh-token");
    }
    // Removing the user and logging in, will give two different user objects
    await app.removeUser(gilfoyle3);
    const gilfoyle4 = await app.logIn(credentials1, false);
    expect(app.allUsers).deep.equals({
      [gilfoyle4.id]: gilfoyle4,
      [dinesh.id]: dinesh,
    });
    expect(gilfoyle4).not.equals(gilfoyle3);
    // Expect that the current user has the tokens from the forth login
    {
      const { currentUser } = app;
      const { accessToken, refreshToken } = currentUser || {};
      expect(accessToken).equals("gilfoyles-forth-access-token");
      expect(refreshToken).equals("gilfoyles-forth-refresh-token");
    }
  });
});
