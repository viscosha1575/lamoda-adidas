export async function deletePlayerWithRelations(pool, playerId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const playerResult = await client.query(
      `SELECT id, referral_code
         FROM players
        WHERE id = $1
        LIMIT 1
        FOR UPDATE`,
      [playerId],
    );

    const player = playerResult.rows[0] ?? null;

    if (!player) {
      await client.query("ROLLBACK");
      return false;
    }

    if (player.referral_code) {
      await client.query(
        `UPDATE players
            SET referred_by_code = NULL,
                has_referral = FALSE,
                updated_at = NOW()
          WHERE referred_by_code = $1`,
        [player.referral_code],
      );
    }

    await client.query(
      `UPDATE promo_codes
          SET assigned_player_id = NULL,
              assigned_at = NULL,
              updated_at = NOW()
        WHERE assigned_player_id = $1`,
      [playerId],
    );

    const deletedResult = await client.query(
      `DELETE FROM players
        WHERE id = $1
        RETURNING id`,
      [playerId],
    );

    await client.query("COMMIT");
    return deletedResult.rowCount > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
