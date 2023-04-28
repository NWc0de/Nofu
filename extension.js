// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const { symbolName } = require('typescript');

const struct_source_map = new Map();
const typedef_struct_map = new Map();
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('nofu - activate() entered');

	// suck in everything up to 5 levels deep
	vscode.workspace.findFiles('**/**/**/**/**/**').then((res) => {
		console.log("Find files callback entered");
		let uri;
		for (let i = 0; i < res.length; i++)
			parse_source_file(res[i].fsPath);
	});

	let disposable = vscode.commands.registerCommand('nofu.machinify', function () {
		let text, range;
		if (vscode.window.activeTextEditor.selection.isEmpty)
		{
			text = vscode.window.activeTextEditor.document.getText();
			range = new vscode.Range(vscode.window.activeTextEditor.document.positionAt(0), vscode.window.activeTextEditor.document.positionAt(text.length));
		}
		else
		{
			text = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selection);
			range = vscode.window.activeTextEditor.selection;
		}
		//console.log(destructify_external(text));
		let replacified = text.replaceAll("Hello", "nofu");
		vscode.window.activeTextEditor.edit(function (editBuilder) {
		    editBuilder.replace(range, replacified)
		})
		console.log("nofu.Machinify end");
	});

	context.subscriptions.push(disposable);
}

/*
  Un-abstractify a struct.

  eg.

some random type specific header .h
enum EventType {ONE, TWO, THREE};

some random net specific header .h
enum OriginId {HOST, NET};
enum TransmissionClass {TCP, UDP, P2P};
enum MAC_Type {SHA256, MD5, SHA1, ECC};

some random file.h
struct TransmissionHeader
{
    char* buf;
    int len;
    OriginId oId;
};

some random source file .c
struct EventChain
{
    struct EventChain* n;
    char* buf;
    int len;
    EventType type;
};

some other random header in the repo .h
struct ProtoBufArray
{
    struct EventChain* chain;
    int len;
    TransmissionClass tClass;
};

the file you're currently looking at .cpp
struct TransmissionPacket
{
    struct ProtoBufArray protobufArray;
    MAC_Type macType;
    char* macBug;
    TransmissionHeader header;
};

struct TransmissionPacket
{
    |     
        |
            struct {self}* n;
            char* buf;
            int len;
            EventType type;
        |
        | chain;
        int len;
        TransmissionClass tClass;
    |
    | protofBufArray;
    
    MAC_Type macType;

    char* macBug;

    |
        char* buf;
        int len;
        OriginId oId;
    |
    | header;
};

*/
function destructify_external (symbolicName) {
	return destructify_internal(symbolicName);
}

function destructify_internal (symbolicName) {
	let sym;
	let isPtr = false;
	let ds = "|\n";
	if (typedef_struct_map.has(symbolicName))
	{
		sym = typedef_struct_map.get(symbolicName);
		if (sym[0] == "*")
		{
			isPtr = true;
			sym = sym.slice(1);
		}
	}
	else
	{
		sym = symbolicName;
	}

	if (!struct_source_map.has(sym)) {
		console.log("Could not find " + sym + " in struct_source_map.");
		return sym;
	}

	let fp = struct_source_map.get(sym);
	let fps = fp.split("|+|");
	let uri = fps[0];
	let pos = fps[1];
	pos += 1; // pos will be the position of the opening bracket following the symbolicName
	try {
		const file_text = fs.readFileSync(uri, 'utf8');

		while (file_text[pos] != "}")
		{
			let line = "";
			while (file_text[pos] != ";") {
				line += file_text[pos++];
			}
			line += ";";
			
			let splitSpace = line.split(" ");
			for (let i = 0; i < splitSpace.length; i++) {
				if (struct_source_map.has(splitSpace[i])) {
					line.replace(splitSpace[i], destructify_internal(splitSpace[i]));
				}
			}

			ds += line + "\n";

			while (file_text[pos] == " ")
				pos++;
		}
	  } catch (err) {
		console.error(err);
	}
	ds += "|\n";
	ds += "| " + symbolicName + "\n";
	return ds;
}


function parse_source_file(uri) {
    if (!(uri.endsWith("c") || uri.endsWith("cc") || uri.endsWith("h") || uri.endsWith("cpp")))
	{
		return null;
	}
	
	try {
		// there is not much reliable data on the prevalance of encoding schemes
		// we assume utf8 here based on anecdotal ubiquity
		const file_text = fs.readFileSync(uri, 'utf8');

		process_structs(file_text);
	  } catch (err) {
		console.error(err);
	}
}

/*
    Pull the defined structs in string "file_text" info an in memory data store.

	This is complex and untenable in generality, we're only handling two common cases
	below.

	"Typical" multline line struct definitions with or without aliases:

	(?:typedef)? struct ______ (?: : (/w+)) \{
		...
	} (?:((\w+\*,?)+)?
	
	Single line typedef aliases:

	typedef struct _____ ((\w+\*,?)+

	How many other imaginable combinations of accpeted syntax are possible here?

	¯\_(ツ)_/¯

	The above is also biased from personal experience and fairly limited exposure to
	C++ styles.

	TODO: implement indifferentiable (find, without fail, all struct definitions and
		report in machinify results that a type *is* a struct but could not be parsed to
		avoid supplying the bad implicit presumption that the inability to find a struct
		definition implies it is not a struct but some other user defined type)

	
	Limitations:

	multi line definitions:

	    struct _____
	    {
	
	    typedef struct _____
	                 _____;
*/
function process_structs(file_text, uri) {
	/*
		"Typical" multline line struct definitions with or without aliases
	*/
	let struct_defs = file_text.match(/.*struct\s+((\w|_)+)\s+(?::\s+((\w|_)+)\s+)?\{/g);
	let len;
	if (struct_defs == null)
		len = 0;
	else
		len = struct_defs.length;
	for (let i = 0; i < len; i++) {
		let splitSpace = struct_defs[i].split(" ");
		let symbolicName;
		if (':' in splitSpace)
			symbolicName = splitSpace[splitSpace.length - 3];
		else
			symbolicName = splitSpace[splitSpace.length - 2];
		
		let k =	file_text.search(struct_defs[i]);
		while (file_text[k] != "{")
			k++;

		struct_source_map.set(symbolicName, uri + "|+|" + k);

		if (struct_defs[i].search('typedef ') != -1)
		{
			process_typedef(as_typedef_statement(struct_defs[i], file_text), symbolicName, true);
		}
	}

	/*
		Single line typedef aliases
	*/
	let struct_aliasing = file_text.match(/typedef\s+struct.*;/g);
	let len2;
	if (struct_aliasing == null)
		len2 = 0;
	else
		len2 = struct_aliasing.length;
	for (let i = 0; i < len2; i++) {
		let splitSpace = struct_aliasing[i].split(" ");
		let symbolicName;
		if (splitSpace.length < 3)
		{
			console.log("--------BEGIN ERROR MESSAGE------------");
			console.log("Error occurred while processing struct alias " + struct_aliasing[i]);
			console.log("In file " + uri);
			console.log("--------END ERROR MESSAGE------------");
		}
		if (splitSpace[2].charAt(splitSpace[2].length - 1) == '*')
			symbolicName = splitSpace[2].slice(0, -1);
		else
			symbolicName = splitSpace[2];
		

		process_typedef(struct_aliasing[i], symbolicName, false);
	}
	//console.log(struct_defs);
}


function as_typedef_statement(match, file_text)
{
	let i = file_text.search(match);
	let j = 0;
	var o_br = false;
	var c_br = false;
	let as_str = "";
	while (1)
	{
		if (file_text[i] == ';' && !o_br)
		{
			break;
		}
		if (file_text[i] == '{' && !o_br)
		{
			o_br = true;
		}
		else if (file_text[i] == '{' && o_br)
		{
			j++;
		}
		if (file_text[i] == '}' && j > 0)
		{
			j--;
		}
		if (file_text[i] == '}' && j == 0)
		{
			c_br = true;
		}
		if (file_text[i] == ';' && (o_br && c_br))
		{
			as_str += ';';
			break;
		}
		as_str += file_text[i++];
	}
	return as_str;
}

/*
	Contract (Output is stored in typedef_struct_map):

	multiline=false
	statement="typedef struct _RTL_CRITICAL_SECTION CRITICAL_SECTION;"
	symbolic_name="_RTL_CRITICAL_SECTION"

	Output: {CRITICAL_SECTION: '_RTL_CRITICAL_SECTION'} 

	multiline=false
	statement="typedef struct _RTL_CRITICAL_SECTION_DEBUG* PRTL_CRITICAL_SECTION_DEBUG;"
	symbolic_name="_RTL_CRITICAL_SECTION"

	Output: {PRTL_CRITICAL_SECTION_DEBUG: '*_RTL_CRITICAL_SECTION_DEBUG'}

	multiline=false
	statement="typedef struct MyTestStruct MyAliasStruct, * PMyAliasStruct;"
	symbolic_name="_RTL_CRITICAL_SECTION"

	Output: {PRTL_CRITICAL_SECTION_DEBUG: '*_RTL_CRITICAL_SECTION_DEBUG'}


	multiline=true
	statement="typedef struct MyTestStruct {
	int x;
	int y;
	} ALIAS, *PALIAS;"
	symbolic_name="MyTestStruct"

	Output: {ALIAS: 'MyTestStruct', PALAIAS: '*MyTestStruct'}

    multiline=true
	statement="typedef struct MyTestStruct2 : MyParentTestStruct {
	int a;
	int b;
	int z;
	} ALIAS2, *PALIAS2;"
	symbolic_name="MyTestStruct2"

	Output: {ALIAS2: 'MyTestStruct2', ALIAS2: '*MyTestStruct2'}
*/
function process_typedef(statement, symbolic_name, multiline) {
	if (multiline)
	{
		process_mutliline_typedef(statement, symbolic_name);
	}
	else
	{
		process_singleline_typedef(statement, symbolic_name);
	}
}

function process_singleline_typedef(statement, symbolic_name)
{
	let splitSpace = statement.split(" ").slice(2);
	if (splitSpace[0].charAt(splitSpace[0].length - 1) == '*') {
		typedef_struct_map.set(splitSpace[1].split(0, -1), "*" + symbolic_name);
	}
	let splitSpace2 = splitSpace.slice(1);
	for (let j = 0; j < splitSpace2.length; j++) {
		if (splitSpace2[j].search(/\*\w+(,|;)/g) != -1) {
			typedef_struct_map.set(splitSpace2[j].split(1), "*" + symbolic_name);
			continue;
		}
		if (j > 0)
		{
			if (splitSpace2[j].search(/\w+(,|;)/g) != -1 && splitSpace2[j - 1] == "*") {
				typedef_struct_map.set(splitSpace2[j], "*" + symbolic_name);
				continue;
			}
		}
		if (splitSpace2[j].search(/\w+(,|;)/g) != -1) {
			typedef_struct_map.set(splitSpace2[j].split(1), symbolic_name);
		}
	}
}

/*

*/
function process_mutliline_typedef(statement, symbolic_name)
{
	let aliases = [];
	let llr = "";

	for (let i = statement.length - 1; i >= 0; i--)
	{
		if (statement[i] == '}')
			break;

		llr += statement[i];
	}
	let ll = llr.split("").reverse().join("");

	// at this point assume we have
	// ""} ALIAS2, *ALIAS2, ALIAS3(?:, ALIAS.)*;""
	let alist = ll.split(" ");
	for (let j = 0; j < alist.length; j++)
	{
		if (alist[j].search(/\w+(,|;)/g) != -1)
		{
			let alias = alist[j].slice(0, -1);
			if (alias[0] == '*')
			{
				let alias_stripped = alias.slice(1);
				typedef_struct_map.set(alias_stripped, "*" + symbolic_name);
			}
			else
			{
				typedef_struct_map.set(alias, symbolic_name);
			}
		}
	}
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
