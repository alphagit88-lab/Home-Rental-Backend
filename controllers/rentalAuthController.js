const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const jwtConfig = require("../config/jwt");
const HomeRentalAccount = require("../models/HomeRentalAccount");

const APP_ROLE_MAP = {
  tenant: {
    systemRole: "customer",
    supplierType: null,
  },
  owner: {
    systemRole: "supplier",
    supplierType: "residential",
  },
  service_provider: {
    systemRole: "supplier",
    supplierType: null,
  },
};

const buildToken = (account) =>
  jwt.sign(
    {
      id: account.userId,
      role: account.systemRole,
      appRole: account.appRole,
      email: account.email,
    },
    jwtConfig.secret,
    { expiresIn: jwtConfig.expiresIn },
  );

const formatUser = (account) => ({
  id: account.userId,
  name: account.name,
  email: account.email,
  role: account.appRole,
  systemRole: account.systemRole,
});

const generateInternalPhone = async (client) => {
  while (true) {
    const candidate = `HR${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 8)}`
      .toUpperCase()
      .slice(0, 20);

    const result = await client.query(
      "SELECT 1 FROM users WHERE phone = $1 LIMIT 1",
      [candidate],
    );

    if (result.rows.length === 0) {
      return candidate;
    }
  }
};

const signup = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const name = req.body.name.trim();
    const email = req.body.email.trim().toLowerCase();
    const { password } = req.body;
    const appRole = req.body.role;
    const roleConfig = APP_ROLE_MAP[appRole];

    if (!roleConfig) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Use tenant, owner, or service_provider.",
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;

    const existingAccount = await HomeRentalAccount.findByEmail(email, client);
    if (existingAccount) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    const internalPhone = await generateInternalPhone(client);
    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await client.query(
      `
        INSERT INTO users (
          name,
          phone,
          email,
          role,
          supplier_type,
          supplier_id,
          password_hash,
          push_token,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NULL, $6, NULL, NOW(), NOW())
        RETURNING
          id,
          name,
          phone,
          email,
          role AS "systemRole",
          supplier_type AS "supplierType",
          supplier_id AS "supplierId",
          push_token AS "pushToken",
          created_at AS "userCreatedAt",
          updated_at AS "userUpdatedAt"
      `,
      [
        name,
        internalPhone,
        email,
        roleConfig.systemRole,
        roleConfig.supplierType,
        passwordHash,
      ],
    );

    const user = userResult.rows[0];

    await HomeRentalAccount.create(
      {
        userId: user.id,
        email,
        appRole,
      },
      client,
    );

    const account = await HomeRentalAccount.findByUserId(user.id, client);

    await client.query("COMMIT");
    transactionStarted = false;

    const token = buildToken(account);

    res.status(201).json({
      success: true,
      message: "Home rental account created successfully",
      data: {
        user: formatUser(account),
        token,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("Rental signup error:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating home rental account",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const login = async (req, res) => {
  try {
    const email = req.body.email.trim().toLowerCase();
    const { password } = req.body;

    const account = await HomeRentalAccount.findByEmail(email);

    if (!account || !account.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      account.passwordHash,
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = buildToken(account);

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: formatUser(account),
        token,
      },
    });
  } catch (error) {
    console.error("Rental login error:", error);
    res.status(500).json({
      success: false,
      message: "Error during login",
      error: error.message,
    });
  }
};

const getMe = async (req, res) => {
  try {
    const account = await HomeRentalAccount.findByUserId(req.user.id);

    if (!account || !account.isActive) {
      return res.status(404).json({
        success: false,
        message: "Home rental account not found",
      });
    }

    res.json({
      success: true,
      data: {
        user: formatUser(account),
      },
    });
  } catch (error) {
    console.error("Rental getMe error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user",
      error: error.message,
    });
  }
};

const updateProfile = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const name = req.body.name.trim();
    const email = req.body.email.trim().toLowerCase();
    const currentPassword = req.body.currentPassword || "";
    const newPassword = req.body.newPassword || "";
    const wantsPasswordChange = Boolean(currentPassword || newPassword);

    await client.query("BEGIN");
    transactionStarted = true;

    const currentAccount = await HomeRentalAccount.findByUserId(
      req.user.id,
      client,
    );

    if (!currentAccount || !currentAccount.isActive) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Home rental account not found",
      });
    }

    const emailOwner = await HomeRentalAccount.findByEmail(email, client);

    if (emailOwner && emailOwner.userId !== req.user.id) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "This email is already in use by another account",
      });
    }

    let passwordHash;

    if (wantsPasswordChange) {
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        currentAccount.passwordHash,
      );

      if (!isCurrentPasswordValid) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      if (currentPassword === newPassword) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: "New password must be different from current password",
        });
      }

      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updatedAccount = await HomeRentalAccount.updateByUserId(
      req.user.id,
      { name, email, passwordHash },
      client,
    );

    await client.query("COMMIT");
    transactionStarted = false;

    res.json({
      success: true,
      message: wantsPasswordChange
        ? "Profile and password updated successfully"
        : "Profile updated successfully",
      data: {
        user: formatUser(updatedAccount),
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("Rental update profile error:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "This email is already in use by another account",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  signup,
  login,
  getMe,
  updateProfile,
};
