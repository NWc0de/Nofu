// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const { symbolName } = require('typescript');
const { get } = require('http');
const { workerData } = require('worker_threads');
const { workspace } = require('vscode');

const struct_source_map = new Map();
const typedef_struct_map = new Map();
const statusBarItem =  vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
var init = false;
var tmpFile = "";

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('nofu - activate() entered');

	statusBarItem.text = "Destruct : parsing source files $(sync~spin)";
	statusBarItem.show();
	
	let disposable = vscode.commands.registerCommand('nofu.machinify', function () {
		if (!init) {
			// could use workspace.findFiles but want blocking here...
			let toParse = getWorkspaceFiles(/.*\.(c|h|cc|cpp)$/);
			console.log("Find files begin");
			
			for (let i = 0; i < toParse.length; i++) {
				parse_source_file(toParse[i]);
			}
			console.log("Find files complete");
			statusBarItem.hide();
			tmpFile = workspace.workspaceFolders[0].uri.fsPath + "\\last_destruct.txt";
			init = true;
		}
		let text;
		if (vscode.window.activeTextEditor.selection.isEmpty)
		{
			return;
		}
		else
		{
			text = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selection);
		}

		if (!(struct_source_map.has(get_root_symbol(text).sym))) {
			vscode.window.showInformationMessage(text + " was not found as a struct definition during parsing. Know it's a struct? Please submit a bug (TODO repo)");
			return;
		}
		
		console.log(destructify_external(text, ""));
		let destructed = text + " destructed\n\n";
		destructed += destructify_external(text, "");
		fs.writeFileSync(tmpFile, destructed);

		vscode.window.showTextDocument(vscode.Uri.file(tmpFile));

		console.log("nofu.Machinify end");
	});

	context.subscriptions.push(disposable);
}

function getWorkspaceFiles(file_re) {
	// limitation: only the first workspaceFolder?
	let toParse = [];
	let searchRoot = workspace.workspaceFolders[0].uri.fsPath;
	let dirs = [searchRoot];
	while (dirs.length > 0) {
		let cur = dirs.pop();
		let contents = fs.readdirSync(cur, {withFileTypes: true});
		for (let i = 0; i < contents.length; i++) {
			if (contents[i].isDirectory()) {
				dirs.push(cur + "\\" + contents[i].name);
			} else if (contents[i].isFile() && contents[i].name.search(file_re) != -1) {
				toParse.push(cur + "\\" + contents[i].name);
			}
		}
	}

	return toParse;
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
function destructify_external (symbolicName, remainder) {
	let asRoot = get_root_symbol(symbolicName);
	let stack;
	if (asRoot != symbolicName) {
		stack = [asRoot];
	} else {
		stack = [asRoot, symbolicName];
	}
	return destructify_internal(symbolicName, stack, remainder, true);
}

function destructify_internal (symbolicName, stack, remainder, firstCall=false) {
	let ds = "|";
	let symObj = get_root_symbol(symbolicName);
	let sym = symObj.sym;
	let isPtr = symObj.isPointer;

	if (stack.includes(sym) && !firstCall) {
		return sym;
	} else {
		stack.push(sym);
		stack.push(symbolicName);
	}

	if (!struct_source_map.has(sym)) {
		console.error("Could not find " + sym + " in struct_source_map.");
		return sym;
	}

	let fp = struct_source_map.get(sym);
	let fps = fp.split("|+|");
	let uri = fps[0];
	let pos = parseInt(fps[1], 10);

	try {
		const file_text = fs.readFileSync(uri, 'utf8');
		let block = block_as_string(pos, file_text, false);
		let k = 0;
		let line = "";

		for (let m = 0; m < block.length; m++)
		{
			line += block[m];
			if (block[m] == ";")
			{
				let splitSpace = line.split(" ");
				let line_rep = line;
				for (let i = 0; i < splitSpace.length; i++) {
					let symClean = splitSpace[i];
					let symSearch;
					if (symClean.charAt(symClean.length - 1) == '*')
					{
						symSearch = symClean.slice(0, -1);
					}
					else
					{
						symSearch = symClean;
					}
					let symRootObj = get_root_symbol(symSearch);
					let symRoot = symRootObj.sym;
					if (stack.includes(symRoot)) {
						line_rep = replace_pretty(symSearch, symRoot, line);
						continue;
					}
					if (struct_source_map.has(symRoot) && symRoot.isPtr) {
						line_rep = replace_pretty(symSearch, destructify_internal(symRoot, stack, line.slice(line.search(symSearch) + symSearch.length, line.length), false), " * " + line);
					} else if (struct_source_map.has(symRoot))
					{
						line_rep = replace_pretty(symSearch, destructify_internal(symRoot, stack, line.slice(line.search(symSearch) + symSearch.length, line.length), false), line);
					}
				}

				ds += line_rep;
				line = "";
			}
		}
	  } catch (err) {
		console.error(err);
	}
	ds += "\n|\n";
	if (isPtr)
		ds += "| *";
	else
		ds += "| " + remainder;
	return ds;
}

function get_root_symbol(symbol) {
	let symRoot = symbol;
	let isPtr = false;
	while (typedef_struct_map.has(symRoot)) {
		symRoot = typedef_struct_map.get(symRoot);
		if (symRoot[0] == "*")
		{
			isPtr = true;
			symRoot = symRoot.slice(1);
		}
	}
	return { sym: symRoot, isPointer : isPtr };
}

function replace_pretty(symbol, replace_d, line)
{
	let ofs;
	let line_rep;
	if (line.search("struct") != -1)
	{
		line_rep = line.split("struct").join("");
	}
	else
	{
		line_rep = line;
	}
	
	ofs = line_rep.search(symbol);
	ofs -= 3; // newline
	if (ofs < 0)
	{
		ofs = 0;
	}
	let lines = replace_d.split("\n");
	let symSplit = line_rep.split(symbol);
	let str_build = symSplit[0] + lines[0];
	for (let k = 1; k < lines.length; k++) {
		console.log(ofs);
		str_build += "\n" + " ".repeat(ofs) + lines[k];
	}
	return str_build;
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

		process_structs(file_text, uri);
	  } catch (err) {
		console.error(err);
	}
}

/*
    Pull the defined structs in string "file_text" into an in memory data store.

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
	let struct_defs = file_text.match(/.*struct\s+((\w|_)+)\s+(?::\s+(((\w|_)+)\s+)+)?\{/g);
	let len;
	if (struct_defs == null)
		len = 0;
	else
		len = struct_defs.length;
	for (let i = 0; i < len; i++) {
		let splitSpace = struct_defs[i].split(" ");
		let symbolicName;
		if (':' in splitSpace)
			symbolicName = splitSpace[splitSpace.findIndex(":") - 1];
		else
			symbolicName = splitSpace[splitSpace.length - 2];
		
		let k =	file_text.search(struct_defs[i]);
		while (file_text[k] != "{")
			k++;

		// fuzzy matching, assume we're going to suck in something we don't want
		if (symbolicName.match(/[\w_0-9]+/ ) != null && symbolicName != "struct")
			struct_source_map.set(symbolicName, uri + "|+|" + k);

		if (struct_defs[i].search('typedef ') != -1)
		{
			let pos = file_text.search(struct_defs[i]) + struct_defs[i].search("{");
			process_typedef(block_as_string(pos, file_text), symbolicName, true);
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
}


/*
  Takes the position of an opening bracket in a uri and returns a string comprised of
  all characters between that opening bracket and the corresponding closing bracket
*/
function block_as_string(pos, file_text, retain_brackets=true, remove_comments=true)
{
	let i = pos;
	let j = 0;
	var c_br = false;
	let as_str = "";
	if (!retain_brackets) {
		while (file_text[i] == "{" || file_text[i] == "\n" || file_text[i] == " ")
		{
			i++;
		}
	}
	while (1)
	{
		if (file_text[i] == '/' && file_text[i + 1] == '/') {
			while (file_text[i] != '\n') {
				i++;
			}
			i++;
		}
		if (file_text[i] == '/' && file_text[i + 1] == '*') {
			while (!(file_text[i] == '*' && file_text[i + 1] == '/')) {
				i++;
			}
			i += 2;
		}
		if (file_text[i] == '{')
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
			if (!retain_brackets) {
				break;
			}
		}
		if (file_text[i] == ';' && (c_br))
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
			typedef_struct_map.set(splitSpace2[j].slice(0, splitSpace2[j].length - 1), symbolic_name);
		}
	}
}


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
function deactivate() {
	
}

module.exports = {
	activate,
	deactivate
}
