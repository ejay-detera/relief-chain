const mode = process.argv[2];

switch (mode) {
  case 'success':
    process.stdout.write('fixture completed\n');
    break;
  case 'streams':
    process.stdout.write('stdout only\n');
    process.stderr.write('stderr only\n');
    break;
  case 'failure':
    process.stderr.write('powershell.exe exited with code 23\nspecific child failure\n');
    process.exitCode = 23;
    break;
  case 'timeout':
    setTimeout(() => process.stdout.write('unexpected completion\n'), 10_000);
    break;
  case 'secrets':
    process.stdout.write(`token=${process.env.VALIDATION_TEST_TOKEN}\n`);
    process.stderr.write(`Authorization: Bearer ${process.env.VALIDATION_TEST_TOKEN}\n`);
    break;
  default:
    process.stderr.write(`unknown fixture mode: ${mode}\n`);
    process.exitCode = 2;
}
