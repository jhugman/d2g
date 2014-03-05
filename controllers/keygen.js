// utilities for creating new public / private keypairs

var crypto = require('crypto');
var sys = require('sys');
var _ = require('lodash');
var os = require('os');
var path = require('path'),
	fs = require('fs');

// see http://stackoverflow.com/questions/8520973/how-to-create-a-pair-private-public-keys-using-node-js-crypto
// see https://github.com/digitarald/d2g/issues/2

exports.createKeypair = function(cb) {
	var exec = require('child_process').exec;

	// parameters to keytool
	// assumes a bogus corporation called Acme
	// uses os.tmpdir to put the new keystore in a valid temporary directory
	// returns the parameters object

	// TODO : how come there's nothing in here about the domain?

	var keygenParams = {
		keystore: path.join(os.tmpdir(), "newkeystore"),
		alias : "Acme",
		commonName: "Acme Co TEST",
		organizationUnit: "Apps",
		organization: "Acme Org",
		city: "Acmetown",
		state: "CA",
		countryCode: "US",
		store_password: "keystorepassword",
		alias_password: "aliaspassword"
	};

	var keygenTemplate = 'keytool -genkey -v -keystore <%-keystore%> -alias <%-alias%> -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=<%-commonName%>, OU=<%-organizationUnit%>, O=<%-organization%>, L=<%-city%>, S=<%-state%>, C=<%-countryCode%>" -storepass <%-store_password%> -keypass <%-alias_password%>'
	var keygenCommand = _.template(keygenTemplate, keygenParams);

	if (fs.existsSync(keygenParams.keystore)) {
		fs.unlinkSync(keygenParams.keystore);
	}

	exec(keygenCommand, function (error, stdout, stderr) {
		console.log(stdout);
		if (typeof cb === 'function') {
			cb(keygenParams);
		}
	});

	return keygenParams;
}

// TODO: need something better than passing around keygenPArams -- replace with config

exports.signAppStream = function(unsignedPackageStream, signedPackageStream, keygenParams) {
	// TODO: create temp file in os.tmpdir()
	// TODO: write input stream to a file

	var filestem = 'Package-' + Date.now();
	var unsignedFilename = 'tmp-' + filestem + '.zip';
	var signedFilename = 'signed-' + filestem + '.zip';

	var unsignedFileStream = fs.createWriteStream(unsignedFilename);

	unsignedPackageStream.pipe(unsignedFileStream);

	//TODO: wait until the above is done

	unsignedPackageStream.on('end', function() {
		// TODO: invoke signAppPackage
		exports.signAppPackage(unsignedFilename, signedFilename, keygenParams, function(exitCode) {
			// done signing, OK to delete unsigned package
			fs.unlinkSync(unsignedFilename);

			// TODO: write output file to output stream
			var signedFileStream = fs.createReadStream(signedFilename);

			signedFileStream.pipe(signedPackageStream);

			signedFileStream.on('end', function() {
				// TODO: delete tmp file
				fs.unlinkSync(signedFilename);
				console.log("done");
			});
		});
	});
}

exports.signAppPackage = function(inputFile, outputFile, keygenParams, cb) {
	var spawn = require('child_process').spawn;
	function puts(error, stdout, stderr) { sys.puts(stdout); sys.puts(stderr); }

	// parameters for invoking jarsigner
	// requires the parameters returned from createKeypair() above

	var jarsignerParams = {
		keystoreURL: 'file://' + keygenParams.keystore,
		storePass: keygenParams.store_password,
		outputFile: outputFile,
		digestAlgorithm: 'SHA1',
		signatureAlgorithm: 'SHA1withRSA',
		jarFile: inputFile,
		alias: keygenParams.alias
	}

	var jarsignerArgumentTemplates = [
		'-keystore', '<%- keystoreURL %>',
		'-storepass', '<%- storePass %>',
		'-signedjar', '<%- outputFile %>',
		'-digestalg', '<%- digestAlgorithm %>',
		'-sigalg', '<%- signatureAlgorithm %>',
		'<%- jarFile %>', '<%- alias %>'
	];

	var jarsignerArguments = jarsignerArgumentTemplates.map(function(element) {
		return _.template(element, jarsignerParams);
	});

	console.log(jarsignerArguments);

	// invoke jarsigner with spawn so we can write to stdin

	var child = spawn('jarsigner', jarsignerArguments);

	child.stderr.on('data', function(data) {
		console.log(data.toString());
	});

	child.stdout.on('data', function(data) {
		console.log(data.toString());
	});

	child.on('close', function(exitCode) {
		console.log("exit code " + exitCode);
		// NOTE: see UNIX exit codes
		cb(exitCode);
	});

	child.stdin.write(keygenParams.alias_password + '\n');
}

// hardwired test of creating keypair and signing zipfile.
// assumes existence of sometext.zip in current working directory

// exports.createKeypair(function (params) {
// 	exports.signAppPackage("sometext.zip", "sometext-signed.zip", params);
// });

exports.createKeypair(function (params) {
	var readUnsigned = fs.createReadStream("sometext.zip");
	var writeSigned = fs.createWriteStream("sometext-signed.zip");
	exports.signAppStream(readUnsigned, writeSigned, params);
});
