'use strict';

/* Based on the default parse5 tree adapter but modified to recognize and generate Handlebars nodes (of varying types) */

//Node construction
exports.createDocument = function () {
    return {
        nodeName: '#document',
        mode: DOCUMENT_MODE.NO_QUIRKS,
        childNodes: []
    };
};

exports.createDocumentFragment = function () {
    return {
        nodeName: '#document-fragment',
        childNodes: []
    };
};

exports.createElement = function (tagName, namespaceURI, attrs) {
    var handlebarAttrs = attrs.map((attr) => { return createHandlebarsAttribute(attr); }); // Transform to handlebars attribute (which is a regular attribute where value is of the type array instead)

    return {
        nodeName: tagName,
        tagName: tagName,
        attrs: attrs,
        handlebarAttrs: handlebarAttrs,
        namespaceURI: namespaceURI,
        childNodes: [],
        parentNode: null
    };
};

exports.createCommentNode = function (data) {
    return {
        nodeName: '#comment',
        data: data,
        parentNode: null
    };
};

var createTextNode = function (value) {
    return {
        nodeName: '#text',
        value: value,
        parentNode: null
    };
};

var createHandlebarsNode = function(value) {
    // Strip {{ }} parts
    value = value.substring(2, value.length-2);
    // Assign a type (text, if, else, ...)
    const nodeName = '#handlebars';

    // openIf
    if(value.substring(0, 3) === '#if') {
        return {
            nodeName: nodeName,
            value: value.substring(4, value.length),
            type: "openIf",
            parentNode: null
        };
    }

    // closeIf
    if(value.substring(0, 3) === '/if') {
        return {
            nodeName: nodeName,
            value: value.substring(4, value.length),
            type: "closeIf",
            parentNode: null
        };
    }

    // openEach
    if(value.substring(0, 5) === '#each') {
        return {
            nodeName: nodeName,
            value: value.substring(6, value.length),
            type: "openEach",
            parentNode: null
        };
    }

    // closeEach
    if(value.substring(0, 5) === '/each') {
        return {
            nodeName: nodeName,
            value: value.substring(6, value.length),
            type: "closeEach",
            parentNode: null
        };
    }

    // text
    return {
        nodeName: nodeName,
        value: value,
        type: 'text',
        parentNode: null
    };
};


//Tree mutation
var appendChild = exports.appendChild = function (parentNode, newNode) {
    parentNode.childNodes.push(newNode);
    newNode.parentNode = parentNode;
};

var insertBefore = exports.insertBefore = function (parentNode, newNode, referenceNode) {
    var insertionIdx = parentNode.childNodes.indexOf(referenceNode);

    parentNode.childNodes.splice(insertionIdx, 0, newNode);
    newNode.parentNode = parentNode;
};

exports.setTemplateContent = function (templateElement, contentElement) {
    templateElement.content = contentElement;
};

exports.getTemplateContent = function (templateElement) {
    return templateElement.content;
};

exports.setDocumentType = function (document, name, publicId, systemId) {
    var doctypeNode = null;

    for (var i = 0; i < document.childNodes.length; i++) {
        if (document.childNodes[i].nodeName === '#documentType') {
            doctypeNode = document.childNodes[i];
            break;
        }
    }

    if (doctypeNode) {
        doctypeNode.name = name;
        doctypeNode.publicId = publicId;
        doctypeNode.systemId = systemId;
    }

    else {
        appendChild(document, {
            nodeName: '#documentType',
            name: name,
            publicId: publicId,
            systemId: systemId
        });
    }
};

exports.setDocumentMode = function (document, mode) {
    document.mode = mode;
};

exports.getDocumentMode = function (document) {
    return document.mode;
};

var detachNode = exports.detachNode = function (node) {
    if (node.parentNode) {
        var idx = node.parentNode.childNodes.indexOf(node);

        node.parentNode.childNodes.splice(idx, 1);
        node.parentNode = null;
    }
};

exports.insertText = function (parentNode, text) {
    if (parentNode.childNodes.length) {
        var prevNode = parentNode.childNodes[parentNode.childNodes.length - 1];
        if (prevNode.nodeName === '#text') {
            //prevNode.value += text;
            //return;
            text = prevNode.value + text;
            detachNode(prevNode);
        }
    }

    // janne If textnode has handlebars, create a handlebars node instead
    // janne Tokenize text, because it might contain one or more handlebar tokens
    const result = text
        .split(/({{[^{}]+}})/) // Tokenize
        .filter((substring) => { return substring !== ""}) // Remove empty strings, but keep whitespace
        .map((substring) => {
            // Test if it's 'normal' text or handlebars
            if(substring.match(/({{[^{}]+}})/)) {
                return createHandlebarsNode(substring);
            }

            // Else, it's a text node
            return createTextNode(substring);
        })
        .forEach((node) => {
            appendChild(parentNode, node)
        });
};

const createHandlebarsAttribute = (attr) => {
    // WARNING: don't modify attr directly, we want to output a new object without changing the existing one
    var attribute = {};
    attribute.name = attr.name;

    // If the attribute name has handlebars, tag it
    attribute.isHandlebars = false;
    if(attr.name.match(/({{[^{}]+}})/)) {
        attribute.isHandlebars = true;
        attribute.name = attr.name.slice(2).slice(0,-2); // Get rid of the handlebars in the name
    }

    // Change value
    var arrayValue = attr.value
        .split(/({{[^{}]+}})/) // Tokenize
        .filter((substring) => { return substring !== ""}) // Remove empty strings, but keep whitespace
        .map((substring) => {
            // Test if it's 'normal' text or handlebars
            if(substring.match(/({{[^{}]+}})/)) {
                return createHandlebarsNode(substring);
            }

            // Else, it's a text node
            return createTextNode(substring);
        });
    attribute.value = arrayValue;
    return attribute;
}

exports.insertTextBefore = function (parentNode, text, referenceNode) {
    var prevNode = parentNode.childNodes[parentNode.childNodes.indexOf(referenceNode) - 1];

    if (prevNode && prevNode.nodeName === '#text')
        prevNode.value += text;
    else
        insertBefore(parentNode, createTextNode(text), referenceNode);
};

// JANNE
// Differentiate between: 
    // make attribute value an array of type text and handlebars
    // if there are text 'nodes' in the value, string everything together
// make sure we don't store attributes double (check on key)
exports.adoptAttributes = function (recipient, attrs) {
    var recipientAttrsMap = [];

    for (var i = 0; i < recipient.attrs.length; i++)
        recipientAttrsMap.push(recipient.attrs[i].name);

    for (var j = 0; j < attrs.length; j++) {
        if (recipientAttrsMap.indexOf(attrs[j].name) === -1)
            recipient.attrs.push(attrs[j]);
    }    
};


//Tree traversing
exports.getFirstChild = function (node) {
    return node.childNodes[0];
};

exports.getChildNodes = function (node) {
    return node.childNodes;
};

exports.getParentNode = function (node) {
    return node.parentNode;
};

exports.getAttrList = function (element) {
    return element.attrs;
};

//Node data
exports.getTagName = function (element) {
    return element.tagName;
};

exports.getNamespaceURI = function (element) {
    return element.namespaceURI;
};

exports.getTextNodeContent = function (textNode) {
    return textNode.value;
};

exports.getCommentNodeContent = function (commentNode) {
    return commentNode.data;
};

exports.getDocumentTypeNodeName = function (doctypeNode) {
    return doctypeNode.name;
};

exports.getDocumentTypeNodePublicId = function (doctypeNode) {
    return doctypeNode.publicId;
};

exports.getDocumentTypeNodeSystemId = function (doctypeNode) {
    return doctypeNode.systemId;
};

//Node types
exports.isTextNode = function (node) {
    return node.nodeName === '#text';
};

exports.isCommentNode = function (node) {
    return node.nodeName === '#comment';
};

exports.isDocumentTypeNode = function (node) {
    return node.nodeName === '#documentType';
};

exports.isElementNode = function (node) {
    return !!node.tagName;
};