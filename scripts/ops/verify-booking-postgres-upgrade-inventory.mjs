#!/usr/bin/env node
// Creates and drops its own empty database on an explicitly opted-in local cluster.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

if (process.env.BACKYRD_BACKUP_EPHEMERAL !== '1') throw Error('isolated_database_required');
const input = new URL(process.env.BACKYRD_UPGRADE_TEST_DB_URL ?? '');
if (!['postgres:', 'postgresql:'].includes(input.protocol)
  || !['127.0.0.1', 'localhost', '[::1]'].includes(input.hostname)
  || input.search || !input.port || !input.username || !input.pathname.slice(1)) {
  throw Error('explicit_loopback_database_required');
}
const connection = {
  ...process.env,
  PGHOST: input.hostname === '[::1]' ? '::1' : input.hostname,
  PGHOSTADDR: undefined,
  PGPORT: input.port,
  PGUSER: decodeURIComponent(input.username),
  PGPASSWORD: decodeURIComponent(input.password),
  PGDATABASE: decodeURIComponent(input.pathname.slice(1)),
  PGSERVICE: undefined,
  PGSERVICEFILE: undefined,
  PGOPTIONS: '-c statement_timeout=10000 -c lock_timeout=1000',
  PGCONNECT_TIMEOUT: '10',
  PGSSLMODE: 'disable',
};
function query(sql, database = connection.PGDATABASE) {
  try {
    return execFileSync('psql', ['-X', '--quiet', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1'], {
      input: sql, encoding: 'utf8', timeout: 30000,
      env: { ...connection, PGDATABASE: database }, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw Error('isolated_upgrade_inventory_query_failed');
  }
}
const database = `booking_upgrade_${randomUUID().replaceAll('-', '')}`;
const inventory = readFileSync(new URL('./booking-postgres-upgrade-inventory.sql', import.meta.url), 'utf8');
let created = false;
try {
  assert.equal(query("select rolsuper from pg_catalog.pg_roles where rolname=current_user"), 't', 'synthetic estimator fixture requires local administrator');
  query(`create database ${database} template template0`);
  created = true;
  const empty = JSON.parse(query(inventory, database));
  assert.equal(empty.read_only, true);
  assert.equal(empty.upgrade_certified, false);
  assert.deepEqual(empty.index_candidates, []);
  assert.deepEqual(empty.custom_estimator_operators, []);
  assert.equal(empty.pgcrypto_data_scan, 'not_performed');
  query(`
    create schema inventory_fixture;
    create extension ltree with schema inventory_fixture;
    create extension btree_gist with schema inventory_fixture;
    set search_path=inventory_fixture,pg_catalog;
    create table items(id integer, value double precision, tree ltree);
    create index tree_btree on items(tree);
    create index tree_gist on items using gist(tree);
    create index float_gist on items using gist(value);
    create index expression_float_gist on items using gist((value+1));
    create index ordinary_float_btree on items(value);
    create index included_float on items(id) include(value);
    create function custom_restrict(internal,oid,internal,integer) returns double precision
      language internal stable as 'eqsel';
    create operator === (function=pg_catalog.int4eq, leftarg=integer, rightarg=integer,
      restrict=inventory_fixture.custom_restrict);
  `, database);
  const result = JSON.parse(query(inventory, database));
  assert.equal(result.read_only, true);
  assert.deepEqual(result.index_candidates.map(row => [row.index_name, row.reason]), [
    ['expression_float_gist', 'gist_float_nan_review'],
    ['float_gist', 'gist_float_nan_review'],
    ['tree_btree', 'ltree_review'],
    ['tree_gist', 'ltree_review'],
  ]);
  assert.equal(result.custom_estimator_operators.length, 1);
  assert.equal(result.custom_estimator_operators[0].operator_name, '===');
  assert.equal(result.custom_estimator_operators[0].restrict_estimator, 'inventory_fixture.custom_restrict');
  assert.equal(result.pgcrypto_data_scan, 'not_performed');
  assert.equal(result.upgrade_certified, false);
  assert.equal(query("select count(*) from inventory_fixture.items", database), '0');
  console.log(JSON.stringify({ status: 'PASS', serverVersion: result.server_version,
    emptyCatalog: true, indexPositiveControls: 4, excludedIndexControls: 2,
    customEstimatorControl: true, readOnly: true, upgradeCertified: false }));
} finally {
  if (created) query(`drop database ${database}`);
}
